# Plan for Updates / Bug Fixes

### Feb 10, 2026

- [x] `User & Auth` Token auto-refresh system & extended token to 60 minutes
- [x] `User & Auth` Auth-aware sync with auto re-login
- [x] `User & Auth` Granular GDrive structure for multi-save data without conflict
- [ ] `User & Auth` Almost-real-time data update and exchange (and check for quotas, too)
- [ ] `Inventory > Crops` Lines quantity consumed via per-trial created
- [ ] `Inventory > Parameters` Change "Quantity" to "Number of Sample"
- [ ] `Inventory > Parameters` Range definition using 2 column (min - max)
- [ ] `Inventory > Parameters` No unit compability
- [ ] `Inventory > Parameters` Insert photo for question per sample/line radio
- [ ] `Inventory > Parameters` New type: Formula, a calculate parameters with custom formula
- [ ] `Trial > Trial Management` General: List for selected param and line with 2 columns, draggable
- [ ] `Trial > Trial Management` General: Add number of rows per plot (number)
- [ ] `Trial > Trial Management` General: Add plot length (number)
- [ ] `Trial > Trial Management` General: Add plant spacing (number, 2 column, width * height in cm)
- [ ] `Trial > Trial Management` General: Add plot area (no of rows per plot * plot length * plant spacing width)
- [ ] `Trial > Trial Management` General: Add expected number of plants per plot (plot length / plant spacing height * no. of rows per plot)
- [ ] `Trial > Trial Management` General: Population per ha (10000m^2 / plant spacing in m)
- [ ] `Trial > Trial Management` Location: no city names on map
- [ ] `Trial > Trial Management` Location: centered to Indonesia, not to Jakarta
- [ ] `Trial > Trial Management` Location: no city names select
- [ ] `Trial > Trial Management` Layouting: change .layouting-row-header innerText from "Rn" to "Range n"
- [ ] `Trial > Trial Management` Layouting: add "Replication n" to every .layouting-table
- [ ] `Trial > Run Trial` Auto save progress everytime click next/prev
- [ ] `Trial > Run Trial` Popup "are you sure?" message everytime move to another line
- [ ] `Trial > Run Trial` Popup "are you sure?" with autosave when #runTrialBackBtn clicked

Reminders Feature:
- [ ] `Reminder` Add new navigation, with Agronomy and Observation submenu
- [ ] `Reminder > Observation` Reminders for data retrieval per parameters
- [ ] `Reminder > Agronomy` Reminders for agronomy things (fertilizing, spraying, etc)

Dashboard Updates:
- [ ] Linked to reminder

Additional/unsure/etc:
- [ ] Observation parameters (date type) linked to run trial/fieldbook and reminders
- [ ] Export and import in Excel/CSV format (escape plan)