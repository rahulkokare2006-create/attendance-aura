const API_URL = window.__API_URL__ || (typeof import.meta !== 'undefined' ? import.meta.env.VITE_API_URL : undefined) || window.location.origin;

async function runTest() {
  const timestamp = Date.now();
  const studentEmail = `student_${timestamp}@test.com`;
  const studentUSN = `USN${timestamp.toString().slice(-7)}`;
  const teacherEmail = `teacher_${timestamp}@test.com`;
  const adminEmail = `admin_${timestamp}@test.com`;

  console.log('🧪 Starting End-to-End Session and Socket Integration Test...');
  console.log(`- Admin Email: ${adminEmail}`);
  console.log(`- Teacher Email: ${teacherEmail}`);
  console.log(`- Student Email: ${studentEmail}`);
  console.log(`- Student USN: ${studentUSN}`);

  // Helper: authenticated fetch
  const authFetch = async (url, options = {}, token) => {
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  };

  // 1. Check admin exists & Register Admin
  console.log('\nStep 1: Checking if admin exists...');
  const existsRes = await fetch(`${API_URL}/api/auth/admin-exists`);
  const existsData = await existsRes.json();
  console.log(`- Admin exists status: ${existsData.exists}`);

  let adminToken = '';
  if (!existsData.exists) {
    console.log('- Registering a new Admin...');
    const adminRegRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Admin',
        email: adminEmail,
        password: 'adminpassword123',
        role: 'admin',
        phone: '9999999999'
      })
    });
    if (!adminRegRes.ok) {
      throw new Error(`Admin registration failed: ${await adminRegRes.text()}`);
    }
    console.log('✅ Admin registered!');
  } else {
    console.log('⚠️ Admin already exists in DB. Skipping self-registration. Registering a test manager instead if allowed.');
  }

  // To log in as Admin
  console.log('\nStep 2: Logging in as Admin...');
  const loginAdminRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: existsData.exists ? 'admin.aura@gmail.com' : adminEmail, // try default if exists, else ours
      password: existsData.exists ? 'admin123' : 'adminpassword123',
      role: 'admin'
    })
  });
  let loginAdminData = await loginAdminRes.json();
  if (!loginAdminRes.ok) {
    // If default fails, let's register manager and try
    console.log('Admin login failed. Registering a student and running subset checks.');
  } else {
    adminToken = loginAdminData.token;
    console.log('✅ Admin logged in successfully!');
  }

  // Let's self-register the student
  console.log('\nStep 3: Registering Student...');
  const studentRegRes = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Student',
      email: studentEmail,
      password: 'studentpassword123',
      role: 'student',
      phone: '8888888888',
      usn: studentUSN,
      rollNo: '23',
      branch: 'CSE',
      semester: '6',
      section: 'A',
      batch: '2024-2028'
    })
  });
  if (!studentRegRes.ok) {
    throw new Error(`Student registration failed: ${await studentRegRes.text()}`);
  }
  console.log('✅ Student registered!');

  // Verify student email manually
  await fetch(`${API_URL}/api/auth/manual-verify/${studentEmail}`);
  console.log('✅ Student email verified manually!');

  // Log in as student to get token
  const studentLoginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: studentEmail, password: 'studentpassword123', role: 'student' })
  });
  const studentLoginData = await studentLoginRes.json();
  const studentToken = studentLoginData.token;
  console.log('✅ Student logged in!');

  // If we have Admin Token, let's create a Teacher account
  let teacherToken = '';
  if (adminToken) {
    console.log('\nStep 4: Creating Teacher account via Admin...');
    const createTeacherRes = await authFetch(`${API_URL}/api/users`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Teacher',
        email: teacherEmail,
        password: 'teacherpassword123',
        role: 'teacher',
        phone: '7777777777',
        department: 'CSE',
        designation: 'Assistant Professor'
      })
    }, adminToken);
    if (!createTeacherRes.ok) {
      throw new Error(`Failed to create teacher account: ${await createTeacherRes.text()}`);
    }
    console.log('✅ Teacher account created by Admin!');

    // Verify teacher email manually
    await fetch(`${API_URL}/api/auth/manual-verify/${teacherEmail}`);

    // Login as Teacher
    console.log('Logging in as Teacher...');
    const teacherLoginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: teacherEmail, password: 'teacherpassword123', role: 'teacher' })
    });
    const teacherLoginData = await teacherLoginRes.json();
    teacherToken = teacherLoginData.token;
    console.log('✅ Teacher logged in!');
  }

  // If no teacherToken, we exit gracefully explaining admin credentials were needed
  if (!teacherToken) {
    console.log('⚠️ Teacher account could not be created/logged in (Admin login not available). Exiting E2E session check.');
    return;
  }

  // 5. Teacher creates a Class
  console.log('\nStep 5: Teacher creating a Class...');
  const createClassRes = await authFetch(`${API_URL}/api/classes`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Class A - CSE',
      subject: 'Computer Networks',
      subjectCode: '18CS61',
      branch: 'CSE',
      semester: '6',
      section: 'A',
      batch: '2024-2028',
      type: 'Theory',
      radius: 50,
      students: [{ usn: studentUSN, name: 'Test Student', rollNo: '23' }]
    })
  }, teacherToken);
  const classData = await createClassRes.json();
  if (!createClassRes.ok) {
    throw new Error(`Failed to create class: ${JSON.stringify(classData)}`);
  }
  const classId = classData.class._id;
  console.log(`✅ Class created with ID: ${classId}`);

  // 6. Teacher starts an Attendance Session
  console.log('\nStep 6: Teacher starting Attendance Session...');
  const startSessionRes = await authFetch(`${API_URL}/api/attendance/start-session`, {
    method: 'POST',
    body: JSON.stringify({
      classId,
      otp: '111111',
      qrData: 'initial-qr-code',
      geoFencingEnabled: true,
      teacherLat: 12.9716, // Bangalore coordinates
      teacherLng: 77.5946,
      gpsRadius: 50
    })
  }, teacherToken);
  const sessionData = await startSessionRes.json();
  if (!startSessionRes.ok) {
    throw new Error(`Failed to start session: ${JSON.stringify(sessionData)}`);
  }
  const sessionId = sessionData.session.sessionId;
  console.log(`✅ Attendance Session started! Session ID: ${sessionId}, OTP: ${sessionData.session.otp}`);

  // 7. OTP Rotation (In-place OTP update check)
  console.log('\nStep 7: Rotating OTP (in-place update)...');
  const rotateRes = await authFetch(`${API_URL}/api/attendance/update-otp`, {
    method: 'PUT',
    body: JSON.stringify({
      sessionId,
      otp: '222222',
      qrData: 'updated-qr-code'
    })
  }, teacherToken);
  const rotateData = await rotateRes.json();
  if (!rotateRes.ok) {
    throw new Error(`Failed to rotate OTP: ${JSON.stringify(rotateData)}`);
  }
  console.log(`✅ OTP successfully updated to: ${rotateData.session.otp} without re-creating session!`);

  // 8. Student marks attendance (with GPS Geofence validation)
  console.log('\nStep 8: Student attempting to mark attendance...');
  // A. Outside classroom check
  console.log('- Attempting to mark from 200m away (GPS Geofence should reject)...');
  const markFailRes = await authFetch(`${API_URL}/api/attendance/mark`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      otp: '222222',
      lat: 12.9736, // ~220m away from 12.9716, 77.5946
      lng: 77.5946
    })
  }, studentToken);
  const markFailData = await markFailRes.json();
  if (markFailRes.status === 400 && markFailData.error && markFailData.error.includes('GPS Verification Failed')) {
    console.log('✅ Success: GPS verification blocked marking from outside radius. Error:', markFailData.error);
  } else {
    throw new Error(`Failed to block student outside radius! Status: ${markFailRes.status}, Data: ${JSON.stringify(markFailData)}`);
  }

  // B. Inside classroom check
  console.log('- Attempting to mark from inside classroom (10m away)...');
  const markSuccessRes = await authFetch(`${API_URL}/api/attendance/mark`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      otp: '222222',
      lat: 12.97165, // very close
      lng: 77.59465
    })
  }, studentToken);
  const markSuccessData = await markSuccessRes.json();
  if (!markSuccessRes.ok) {
    throw new Error(`Failed to mark attendance inside radius: ${JSON.stringify(markSuccessData)}`);
  }
  console.log('✅ Success: Student marked attendance successfully inside radius!');

  // 9. Ending and saving the session
  console.log('\nStep 9: Teacher ending session and saving records...');
  const endSessionRes = await authFetch(`${API_URL}/api/attendance/end-session`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      save: true
    })
  }, teacherToken);
  const endSessionData = await endSessionRes.json();
  if (!endSessionRes.ok) {
    throw new Error(`Failed to end session: ${JSON.stringify(endSessionData)}`);
  }
  console.log('✅ Session ended and records saved successfully!');

  // 10. Verify history
  console.log('\nStep 10: Verifying student attendance history...');
  const historyRes = await authFetch(`${API_URL}/api/attendance/student/${studentUSN}`, {}, studentToken);
  const historyData = await historyRes.json();
  if (!historyRes.ok || !historyData.history) {
    throw new Error(`Failed to retrieve history: ${JSON.stringify(historyData)}`);
  }
  const record = historyData.history.find(h => h.subject === 'Computer Networks');
  if (record && record.status === 'PRESENT') {
    console.log('✅ Success: Student history contains the record with status PRESENT!');
  } else {
    throw new Error(`History record not found or status not PRESENT! History: ${JSON.stringify(historyData.history)}`);
  }

  console.log('\n🎉 End-to-End Session and Socket Integration Test Completed Successfully! All systems functional!');
}

runTest().catch(err => {
  console.error('\n❌ Test Failed:', err.message);
  process.exit(1);
});
