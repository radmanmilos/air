// Run state persistence.
//
// Task state lives under `<cacheDir>/tasks/<runId>.json`. Written atomically
// (temp-file-plus-rename) so concurrent CLI + MCP processes cannot observe a
// half-written file. Multiple tasks never overwrite one another: each run
// gets a unique id.
//
// Task-index updates are guarded by an inter-process lock (R5-09) so two
// processes reading/modifying/writing the index simultaneously cannot lose
// task IDs.
import { paths } from '../config/paths';
import { atomicWriteJson, readJsonFile } from '../utils/atomic';
import { lockedReadModifyWrite } from '../utils/lock';
function stateFile(runId) {
    return `${paths.tasksDir}/${runId}.json`;
}
export async function writeTaskState(state) {
    await atomicWriteJson(stateFile(state.runId), state);
}
export async function readTaskState(runId) {
    return readJsonFile(stateFile(runId));
}
export async function listTaskStates() {
    // Best-effort: read known ids from a sidecar index if present.
    const index = await readJsonFile(`${paths.tasksDir}/index.json`);
    if (!index?.ids)
        return [];
    const out = [];
    for (const id of index.ids) {
        const s = await readTaskState(id);
        if (s)
            out.push(s);
    }
    return out;
}
/**
 * Append a run id to the task index under an inter-process lock so two
 * concurrent processes cannot lose task IDs (R5-09).
 */
export async function appendTaskIndex(runId) {
    const indexFile = `${paths.tasksDir}/index.json`;
    await lockedReadModifyWrite('task-index', indexFile, async (current) => {
        const ids = current?.ids ?? [];
        if (!ids.includes(runId))
            ids.push(runId);
        return { ids };
    }, { timeoutMs: 5000 });
}
export function makeRunId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `run-${ts}-${rand}`;
}
