IMPORTANT – ADD LOGIC ONLY

This is an already working Smart Attendance System.
Do NOT redesign UI.
Do NOT modify existing working features.
Do NOT remove or refactor old logic.
Only ADD the following improvements.

====================
1. FIX SEMESTER / DIVISION SESSION MIX ISSUE
====================

There is an issue where attendance session started for a specific
Semester and Division (example: 3rd Sem – A Division)
is affecting students from other semesters or divisions.

ADD strict validation rule:

When teacher starts a session,
attendance must only be allowed for students where:

Student.semester === Class.semester
AND
Student.division === Class.division
AND
Student.batch === Class.batch

Students from other semesters, divisions, or batches
must NOT see or access the session.

Do NOT change UI.
Only update filtering and validation logic.

====================
2. AUTO BATCH CREATION DURING STUDENT SIGNUP
====================

Enhance Student Signup process.

During student registration:

- Automatically detect batch using USN.
  Example:
    USN: 2HB24EC025
    Extract "24"
    Convert to 2024
    Course duration = 4 years
    Batch = 2024–2028

Logic:

If extracted batch does NOT exist:
- Automatically create batch entry in system.

If batch exists:
- Assign student to existing batch.

Admin panel must automatically reflect:
- Batch name
- Number of students in batch

Admin should NOT manually create batches anymore.

====================
3. SYSTEM STABILITY
====================

- Do NOT modify existing attendance logic except adding validation.
- Do NOT change UI layout.
- Do NOT break authentication.
- Keep all previous features working.
- Only extend existing logic with these rules.