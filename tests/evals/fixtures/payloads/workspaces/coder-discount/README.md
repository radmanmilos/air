# Synthetic coder evaluation workspace

This is a deliberately small, isolated Node.js project for the AIR coder evaluation suite.

The baseline contains a defect in \`src/discount.js\`: the percentage is multiplied as a whole number rather than converted to a fraction. The tests in \`test/discount.test.js\` are expected to fail before the fix and pass after it.

Run the fixture's acceptance command:

~~~bash
node --test
~~~

Do not edit the repository's shared fixture. The evaluation workspace helper copies this directory into a fresh temporary directory for each run.
