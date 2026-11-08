# Roadmap

This file is the plan of files. The Status page of the site reads it, and the tracker of the project mirrors it.

| ID | Item | Status | Summary |
| --- | --- | --- | --- |
| R1 | The first package | done | `@mark1russell7/files` has the path, glob and walk functions of four packages, with their tests as fixtures. |
| R2 | The repository and the first release | done | `0.0.1` is on npm with provenance (2026-11-08). |
| R3 | The glob tester on the site | done | The home page uses `matchesGlob` of the entry `./glob` on a list of paths. |
| R4 | The callers use the package | in progress | `@procedures/fs`, `@procedures/archive`, `@procedures/lib`, `ste-lint`, `conventions` and `release-train` remove their copies. Each move keeps a test of the old behavior. The three `@procedures` packages are in mark1russell7/client#514. |
| R5 | A walk of the matches of a glob | later | A walk gives the files and the folders that match a glob, and it does not enter an ignored folder. Then `fs.glob` removes its own walk. |
