IMPORTANT – MODIFY EXISTING PROJECT ONLY

This Smart Attendance System is already working.
Do NOT redesign the UI.
Do NOT remove any existing feature.
Do NOT change authentication or routing.

Only ADD the features described below.

--------------------------------------------------

1. ADD "EXAM ELIGIBILITY" CARD IN TEACHER DASHBOARD

In the Teacher Dashboard, add a new card next to the existing cards:

Current cards:
- My Classes
- Create New Class
- Attendance History

Add a fourth card:

Card Title: "Exam Eligibility"
Icon: chart or graduation cap icon

When the teacher clicks this card, open a new page called:

"Exam Eligibility Report"

The page must contain the following fields:

- Select Class (dropdown)
- Select Subject (dropdown)
- Start Date
- End Date
- Eligibility Percentage (default value: 50%)

Add button:
"Generate Eligibility Report"

When clicked, display a table with columns:

- Student Name
- USN / Roll Number
- Attendance Percentage

Allow teacher to download this report as an Excel (.xlsx) file.

Do NOT change existing dashboard layout.
Only add this new feature card.

--------------------------------------------------

2. UPDATE AUTO DELETE ATTENDANCE SETTINGS FOR TEACHER

Currently the system deletes attendance records after 1 month.

Modify this behavior:

Default auto delete duration should be changed from:
1 month → 6 months.

Add a new settings option in the Teacher Portal called:

"Attendance Auto Delete Settings"

Add the following controls:

Toggle Switch:
"Enable Auto Delete Attendance"

Options in dropdown:
- 3 Months
- 6 Months (Default)
- 12 Months
- Disabled

Behavior:

If toggle is OFF:
Attendance history should NOT auto delete.

If toggle is ON:
Attendance should be automatically deleted based on the selected duration.

When attendance history is deleted, it must also remove records from:
- Teacher history
- Student history
- Parent history

Do NOT modify existing attendance storage structure.
Only update the auto delete settings.

--------------------------------------------------

3. SYSTEM STABILITY RULES

- Do NOT redesign existing pages.
- Do NOT break login or user roles.
- Do NOT modify geofencing logic.
- Do NOT modify batch logic.
- Only extend the current system with the new features above.

Keep the UI consistent with existing design.