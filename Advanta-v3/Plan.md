# Plan for Updates / Bug Fixes

### Feb 10, 2026

- [x] `User & Auth` Token auto-refresh system & extended token to 60 minutes
- [x] `User & Auth` Auth-aware sync with auto re-login
- [x] `User & Auth` Granular GDrive structure for multi-save data without conflict
- [x] `User & Auth` Almost-real-time data update and exchange (and check for quotas, too)
- [x] `Inventory > Crops` Lines quantity consumed via per-trial created
- [x] `Inventory > Parameters` Change "Quantity" to "Number of Sample"
- [x] `Inventory > Parameters` Range definition using 2 column (min - max)
- [x] `Inventory > Parameters` No unit compability
- [x] `Inventory > Parameters` Insert photo for question per sample/line radio
- [x] `Inventory > Parameters` New type: Formula, a calculate parameters with custom formula
- [x] `Trial > Trial Management` Archived trials
- [x] `Trial > Trial Management` General: List for selected param and line with 2 columns, draggable
- [x] `Trial > Trial Management` General: Add number of rows per plot (number)
- [x] `Trial > Trial Management` General: Add plot length (number)
- [x] `Trial > Trial Management` General: Add plant spacing (number, 2 column, width * height in cm)
- [x] `Trial > Trial Management` General: Add plot area (no of rows per plot * plot length * plant spacing width)
- [x] `Trial > Trial Management` General: Add expected number of plants per plot
- [x] `Trial > Trial Management` General: Population per ha (10000m^2 / plant spacing in m)
- [x] `Trial > Trial Management` Location: no city names on map
- [x] `Trial > Trial Management` Location: centered to Indonesia, not to Jakarta
- [x] `Trial > Trial Management` Location: no city names select
- [x] `Trial > Trial Management` Layouting: change .layouting-row-header innerText from "Rn" to "Range n"
- [x] `Trial > Trial Management` Layouting: add "Replication n" to every .layouting-table
- [x] `Trial > Trial Management` Layouting: List for selected lines, same customization as list for selected param
- [x] `Trial > Run Trial` Auto save progress everytime click next/prev
- [x] `Trial > Run Trial` Popup "are you sure?" message everytime move to another line
- [x] `Trial > Run Trial` Popup "are you sure?" with autosave when #runTrialBackBtn clicked
- [x] `Reminder` Add new navigation, with Agronomy and Observation submenu

### Feb 21, 2026

- [x] `SPECTRA` Init
- [x] `Trial` Click on trial item > Detail, Run Observation, Agronomy Monitoring
- [x] `Trial` Trial detail modal: Lines list per areas
- [x] `Trial` Run Observation: After last question UI
- [x] `Trial` Run Observation: Take photo for photo upload
- [x] `Trial` Run Observation: Preview photo after uploaded
- [x] `Trial` Agronomy Monitoring: Per area, table [Activity, DAP, Date, Chemical, Dose, Remark]
- [x] `Trial` Agronomy Monitoring: Fieldbook: Actual Application Date, Photo
- [x] `Inventory` Import and export system
- [x] `Inventory > Parameters` Last updated per param
- [x] `Inventory > Parameters` Days of Observation per crop, with range
- [x] `Inventory > Parameters` Filter per crop
- [x] `Inventory > Agronomy` Agronomy scheduler
- [x] `Inventory > Agronomy` Crop, Activity, DAP, Chemical, Dose, Remark
- [x] `Reminder > Observation` Reminders for data retrieval per parameters
- [x] `Reminder > Agronomy` Reminders for agronomy things (fertilizing, spraying, etc)
- [x] `Dashboard` Reminder linking

### Feb 24, 2026

#### Update
- [x] `Inventory > Crops` Import and export using Excel/CSV
- [ ] `Trial > Report` Per-trial complete information
- [x] `Trial > Edit, Detail` Experimental design
- [x] `Inventory > Parameters` Formula type definition
#### Bug Fixes and Redesigns
- [x] `syncPanel` animation and position
- [x] Progress bar for Agronomy in `Dashboard` and `Trial`
- [x] Empty state grid columns
- [x] `Reminder > Agronomy` progress bug with no photo
- [x] Toast redesign
- [x] Missing preview map on `Trial > Edit/New`
- [x] Days of Observation on import and export in `Inventory > Parameters`
- [ ] Grid and list layout
- [x] Remove .modal-header from Create and Edit Trial
- [x] Edit trial selected parameters bug (now showing all, only with DoO)

### Mar 1, 2026

#### Update
- [x] `Trial` Planting Seasons
- [x] `Trial` No. of Factors, Treatments
- [x] `Trial` Type of Pollination
#### Bug Fixes and Redesigns
- [x] Automatic logout when error initializing happened