const Attendance = require('../models/Attendance');

const getGraduationYear = (batchStr) => {
  if (!batchStr) return '';
  const matches = String(batchStr).match(/\b(20\d{2})\b/g);
  if (matches && matches.length > 0) {
    return matches[matches.length - 1];
  }
  return String(batchStr).trim().toLowerCase();
};

const normalizeSem = (sem) => {
  if (!sem) return '';
  const match = String(sem).match(/\d+/);
  return match ? match[0] : String(sem).trim().toLowerCase();
};

const norm = (str) => String(str || '').trim().toLowerCase();

/**
 * Automatically initializes past lecture history for a newly registered or imported student.
 * Matches by Branch, Semester, Section, and Graduation Year (supporting Regular & Lateral Entry).
 * Past lectures are backfilled as 'ABSENT' so attendance percentage calculations remain accurate.
 */
async function initializeStudentAttendanceHistory(student) {
  if (!student || !student.usn || !student.branch || !student.semester) {
    return { initializedCount: 0 };
  }

  const usn = student.usn.trim().toUpperCase();
  const studentGradYear = getGraduationYear(student.batch);
  const studentSemNorm = normalizeSem(student.semester);
  const studentBranchNorm = norm(student.branch);
  const studentSectionNorm = norm(student.section);

  try {
    // Find all attendance records in DB
    const candidateRecords = await Attendance.find({
      branch: new RegExp(`^${student.branch.trim()}$`, 'i'),
    });

    let initializedCount = 0;

    for (const record of candidateRecords) {
      const recordGradYear = getGraduationYear(record.batch);
      const recordSemNorm = normalizeSem(record.semester);
      const recordSectionNorm = norm(record.section);

      // Match Branch, Semester, Section, and Graduation Year
      if (
        recordSemNorm === studentSemNorm &&
        recordSectionNorm === studentSectionNorm &&
        (!studentGradYear || !recordGradYear || norm(studentGradYear) === norm(recordGradYear))
      ) {
        // Check if student already has a record on this attendance document
        const existingRecord = record.records.find(
          r => r.usn && r.usn.trim().toUpperCase() === usn
        );

        if (!existingRecord) {
          // Backfill student as ABSENT for this past lecture
          record.records.push({
            usn: usn,
            studentName: student.name || usn,
            status: 'ABSENT',
            markedAt: record.date ? new Date(record.date) : new Date(),
          });
          await record.save();
          initializedCount++;
        }
      }
    }

    if (initializedCount > 0) {
      console.log(`[AttendanceInitializer] Initialized ${initializedCount} past lectures as ABSENT for new student ${student.name} (${usn}) - GradYear ${studentGradYear}`);
    }

    return { initializedCount };
  } catch (err) {
    console.error(`[AttendanceInitializer] Error initializing history for ${usn}:`, err);
    return { initializedCount: 0, error: err.message };
  }
}

module.exports = {
  initializeStudentAttendanceHistory,
  getGraduationYear,
};
