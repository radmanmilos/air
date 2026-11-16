// EXPERIMENTAL / NOT PRODUCTION READY.
// Windows-first OS-enforced sandbox prototype for untrusted evaluation execution.
// P1-05 sandboxed execution is DEFERRED to the SEC-W1 security milestone. This
// prototype is not wired into AIR, not built or run by CI, and must not be enabled
// to satisfy a test. See README.md in this directory.

using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text; using System.Threading.Tasks;
using System.Threading;

class AirSandbox
{
    // --- P/Invoke declarations ---

    [DllImport("userenv.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern int CreateAppContainerProfile(string pszAppContainerName, string pszDisplayName,
        string pszDescription, IntPtr pCapabilities, uint dwCapabilityCount, out IntPtr ppSidAppContainerSid);

    [DllImport("userenv.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern int DeleteAppContainerProfile(string pszAppContainerName);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool TerminateJobObject(IntPtr hJob, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool InitializeProcThreadAttributeList(IntPtr lpAttributeList, uint dwAttributeCount,
        uint dwFlags, ref IntPtr lpSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool UpdateProcThreadAttribute(IntPtr lpAttributeList, uint dwFlags, IntPtr Attribute,
        IntPtr lpValue, IntPtr cbSize, IntPtr lpPreviousValue, IntPtr lpReturnSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateProcess(string lpApplicationName, StringBuilder lpCommandLine,
        IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles,
        uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory,
        ref STARTUPINFOEX lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ReadFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToRead,
        out uint lpNumberOfBytesRead, IntPtr lpOverlapped);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool ConvertSidToStringSid(IntPtr Sid, out string StringSid);

    const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
    const uint CREATE_SUSPENDED = 0x00000004;
    const uint CREATE_NO_WINDOW = 0x08000000;
    static readonly IntPtr PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES = new IntPtr(0x20009);
    const uint WAIT_TIMEOUT = 0x00000102;
    const uint INFINITE = 0xFFFFFFFF;

    [StructLayout(LayoutKind.Sequential)]
    struct SECURITY_CAPABILITIES
    {
        public IntPtr AppContainerSid;
        public IntPtr Capabilities;
        public uint CapabilityCount;
        public uint Reserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFO
    {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public ushort wShowWindow;
        public ushort cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct STARTUPINFOEX
    {
        public STARTUPINFO StartupInfo;
        public IntPtr lpAttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    static int Main(string[] args)
    {
        string workspace = null;
        string command = null;
        var cmdArgs = new System.Collections.Generic.List<string>();
        int timeoutMs = 30000;
        string patchFile = null;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--workspace": workspace = args[++i]; break;
                case "--command": command = args[++i]; break;
                case "--arg": cmdArgs.Add(args[++i]); break;
                case "--timeout": timeoutMs = int.Parse(args[++i]); break;
                case "--patch-file": patchFile = args[++i]; break;
            }
        }

        if (workspace == null || command == null)
        {
            Console.Error.WriteLine("Usage: AirSandbox --workspace <dir> --command <exe> [--arg <a>]... [--timeout ms] [--patch-file <patch>]");
            return 2;
        }

        string profileName = "AirEval_" + Guid.NewGuid().ToString("N");
        IntPtr sid = IntPtr.Zero;
        IntPtr hJob = IntPtr.Zero;

        try
        {
            // 1. Create AppContainer profile (no capabilities = no network).
            int hr = CreateAppContainerProfile(profileName, "Air Evaluation", "Sandboxed eval", IntPtr.Zero, 0, out sid);
            if (hr != 0)
            {
                Console.Error.WriteLine("CreateAppContainerProfile failed: 0x" + hr.ToString("X"));
                return 1;
            }

            // 2. Create Job Object for process-tree containment.
            hJob = CreateJobObject(IntPtr.Zero, null);
            if (hJob == IntPtr.Zero)
            {
                Console.Error.WriteLine("CreateJobObject failed");
                return 1;
            }

            // 3. ACL the workspace for the AppContainer SID (read/write).
            // (Simplified: relies on inherited ACLs; production should set explicit DACL.)
            // For this implementation we set the directory ACL via icacls.
            string sidStr;
            ConvertSidToStringSid(sid, out sidStr);
            RunIcacls(workspace, sidStr);

            // 4. Build command line.
            var sb = new StringBuilder();
            sb.Append(Quote(command));
            foreach (var a in cmdArgs) sb.Append(" " + Quote(a));
            string cmdLine = sb.ToString();

            // 5. Prepare STARTUPINFOEX with security capabilities.
            var si = new STARTUPINFOEX();
            si.StartupInfo.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFOEX));
            IntPtr attrSize = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attrSize);
            si.lpAttributeList = Marshal.AllocHGlobal(attrSize);
            if (!InitializeProcThreadAttributeList(si.lpAttributeList, 1, 0, ref attrSize))
            {
                Console.Error.WriteLine("InitializeProcThreadAttributeList failed");
                return 1;
            }

            var caps = new SECURITY_CAPABILITIES { AppContainerSid = sid, Capabilities = IntPtr.Zero, CapabilityCount = 0, Reserved = 0 };
            IntPtr capsPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(SECURITY_CAPABILITIES)));
            Marshal.StructureToPtr(caps, capsPtr, false);
            if (!UpdateProcThreadAttribute(si.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
                capsPtr, new IntPtr(Marshal.SizeOf(typeof(SECURITY_CAPABILITIES))), IntPtr.Zero, IntPtr.Zero))
            {
                Console.Error.WriteLine("UpdateProcThreadAttribute failed");
                return 1;
            }

            // 6. Create pipes for stdout/stderr.
            var stdoutPipe = CreatePipe();
            var stderrPipe = CreatePipe();

            si.StartupInfo.hStdOutput = stdoutPipe.WriteHandle;
            si.StartupInfo.hStdError = stderrPipe.WriteHandle;
            si.StartupInfo.hStdInput = IntPtr.Zero;
            si.StartupInfo.dwFlags = 0x00000100; // STARTF_USESTDHANDLES

            var pi = new PROCESS_INFORMATION();
            uint flags = EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED | CREATE_NO_WINDOW;

            bool created = CreateProcess(command, new StringBuilder(cmdLine), IntPtr.Zero, IntPtr.Zero,
                true, flags, IntPtr.Zero, workspace, ref si, out pi);

            if (!created)
            {
                Console.Error.WriteLine("CreateProcess failed: " + Marshal.GetLastWin32Error());
                return 1;
            }

            // Close write handles in parent so pipe breaks when child exits.
            if (stdoutPipe.WriteHandle != IntPtr.Zero) { CloseHandle(stdoutPipe.WriteHandle); stdoutPipe.WriteHandle = IntPtr.Zero; }
            if (stderrPipe.WriteHandle != IntPtr.Zero) { CloseHandle(stderrPipe.WriteHandle); stderrPipe.WriteHandle = IntPtr.Zero; }

            // 7. Assign to Job Object before resuming.
            if (!AssignProcessToJobObject(hJob, pi.hProcess))
            {
                Console.Error.WriteLine("AssignProcessToJobObject failed");
                TerminateJobObject(hJob, 1);
                return 1;
            }

            // 8. Resume main thread.
            // (Thread was created suspended; resume via NtResumeThread not declared; use ResumeThread)
            ResumeThread(pi.hThread);

            // 9. Wait with timeout, capturing output.
            var stdoutTask = ReadPipeAsync(stdoutPipe.ReadHandle);
            var stderrTask = ReadPipeAsync(stderrPipe.ReadHandle);

            uint wait = WaitForSingleObject(pi.hProcess, (uint)timeoutMs);
            bool timedOut = (wait == WAIT_TIMEOUT);
            bool cancelled = false;

            if (timedOut)
            {
                TerminateJobObject(hJob, 1);
            }

            // Give pipes a moment to drain.
            Thread.Sleep(200);

            uint exitCode = 0;
            GetExitCodeProcess(pi.hProcess, out exitCode);

            string stdout = stdoutTask.Result;
            string stderr = stderrTask.Result;

            // Bound output.
            if (stdout.Length > 4096) stdout = stdout.Substring(0, 4096) + "...[truncated]";
            if (stderr.Length > 4096) stderr = stderr.Substring(0, 4096) + "...[truncated]";

            Console.WriteLine("AIR_SANDBOX_RESULT");
            Console.WriteLine("exitCode=" + exitCode);
            Console.WriteLine("timedOut=" + timedOut);
            Console.WriteLine("cancelled=" + cancelled);
            Console.WriteLine("STDOUT_BEGIN");
            Console.WriteLine(stdout);
            Console.WriteLine("STDOUT_END");
            Console.WriteLine("STDERR_BEGIN");
            Console.WriteLine(stderr);
            Console.WriteLine("STDERR_END");

            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            CloseHandle(stdoutPipe.ReadHandle);
            CloseHandle(stdoutPipe.WriteHandle);
            CloseHandle(stderrPipe.ReadHandle);
            CloseHandle(stderrPipe.WriteHandle);

            DeleteProcThreadAttributeList(si.lpAttributeList);
            Marshal.FreeHGlobal(si.lpAttributeList);
            Marshal.FreeHGlobal(capsPtr);

            return timedOut ? 124 : (exitCode == 0 ? 0 : 1);
        }
        finally
        {
            if (hJob != IntPtr.Zero) { TerminateJobObject(hJob, 1); CloseHandle(hJob); }
            if (sid != IntPtr.Zero) { /* sid freed by profile deletion */ }
            try { DeleteAppContainerProfile(profileName); } catch { }
        }
    }

    static void RunIcacls(string workspace, string sidStr)
    {
        try
        {
            var psi = new ProcessStartInfo("icacls", $"\"{workspace}\" /grant *{sidStr}:(OI)(CI)F /T")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            using (var p = Process.Start(psi)) { p.WaitForExit(10000); }
        }
        catch { }
    }

    static string Quote(string s)
    {
        if (s.Contains(" ") || s.Contains("\"")) return "\"" + s.Replace("\"", "\\\"") + "\"";
        return s;
    }

    struct PipeHandles { public IntPtr ReadHandle; public IntPtr WriteHandle; }

    static PipeHandles CreatePipe()
    {
        // Use AnonymousPipeServerStream-like via P/Invoke CreatePipe
        var ph = new PipeHandles();
        // CreatePipe
        CreatePipe(out ph.ReadHandle, out ph.WriteHandle, IntPtr.Zero, 0);
        return ph;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CreatePipe(out IntPtr hReadPipe, out IntPtr hWritePipe, IntPtr lpPipeAttributes, uint nSize);

    static Task<string> ReadPipeAsync(IntPtr hRead)
    {
        return Task.Run(() =>
        {
            var buf = new byte[4096];
            var sb = new StringBuilder();
            while (true)
            {
                uint read = 0;
                bool ok = ReadFile(hRead, buf, (uint)buf.Length, out read, IntPtr.Zero);
                if (!ok || read == 0) break;
                sb.Append(Encoding.UTF8.GetString(buf, 0, (int)read));
            }
            return sb.ToString();
        });
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint ResumeThread(IntPtr hThread);
}
