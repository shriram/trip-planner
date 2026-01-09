Assume I am an experienced computer programmer and computer scientist: speak to me accordingly.

Implement everything in TypeScript with proper types (minimize/entirely avoid `any`, for instance).

The workflow for each feature/fix is as follows:
- create a new git branch
- work in that git branch
- when I confirm that we're done:
  - check in the files added/modified
  - make sure all the relevant files have been added
  - commit
  - switch back to `main`
  - merge the branch into `main`
  - delete the new branch
  - push

NEVER use `git -A`. Only commit files that you have created or modified. If in doubt, check with me before adding a file.

Try to write purely functional code as much as possible.

Make sure you have good tests. Use a testing harness. Before claiming that a feature is done, add tests for that feature.

Follow a model-view architecture so that you can test the models and functions extensively, even if the UI isn't very tested.

TECH STACK
- Plain HTML/CSS/TypeScript (no framework initially)
- Static web page (no server)
- JSON for data persistence (Copy/Paste)
- HTML for pretty-print output

PROJECT STRUCTURE
- src/model.ts - data types and pure functions
- src/constraints.ts - constraint checking and repair suggestions
- src/ui.ts - DOM manipulation
- src/main.ts - entry point
- tests/ - test files
