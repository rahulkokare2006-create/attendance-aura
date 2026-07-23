const BASE_URL = process.env.API_URL || 'http://168.231.103.71:3001';

async function runEmpiricalLoadTest() {
  console.log('================================================================');
  console.log('🧪 LIVE LOAD & CONCURRENCY TEST EXECUTION');
  console.log(`Target: ${BASE_URL}`);
  console.log('================================================================\n');

  // 1. 100 CONCURRENT LOGINS
  console.log('🔹 1. Testing 100 Concurrent Logins...');
  const loginStart = Date.now();
  const loginReqs = Array.from({ length: 100 }).map(() =>
    fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@gmail.com', password: 'password123', role: 'admin' })
    }).then(r => ({ ok: r.ok, status: r.status })).catch(e => ({ ok: false, error: e.message }))
  );
  const loginResults = await Promise.all(loginReqs);
  const loginTime = Date.now() - loginStart;
  const login429 = loginResults.filter(r => r.status === 429).length;
  console.log(`   --> Completed in ${loginTime}ms | Total: 100 | Rate Limited (429): ${login429}`);

  // 2. 100 CONCURRENT SIGNUPS
  console.log('\n🔹 2. Testing 100 Concurrent Student Signups...');
  const signupStart = Date.now();
  const ts = Date.now();
  const signupReqs = Array.from({ length: 100 }).map((_, i) =>
    fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Live Student ${i}`,
        email: `emp_student_${ts}_${i}@test.com`,
        password: 'password123',
        role: 'student',
        phone: '9876543210',
        usn: `1ST${String(ts).slice(-5)}${String(i).padStart(2, '0')}`,
        branch: 'CSE',
        semester: '5',
        section: 'A',
        batch: '2022-2026'
      })
    }).then(r => ({ ok: r.ok, status: r.status })).catch(e => ({ ok: false, error: e.message }))
  );
  const signupResults = await Promise.all(signupReqs);
  const signupTime = Date.now() - signupStart;
  const signup429 = signupResults.filter(r => r.status === 429).length;
  console.log(`   --> Completed in ${signupTime}ms | Total: 100 | Rate Limited (429): ${signup429}`);

  // 3. MULTI-CLASS SIMULTANEOUS ATTENDANCE (Class Session A & Session B)
  console.log('\n🔹 3. Testing 50 Concurrent Attendance Submissions for Class A & Class B...');
  const attStart = Date.now();
  const sessionA_Reqs = Array.from({ length: 25 }).map((_, i) =>
    fetch(`${BASE_URL}/api/attendance/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session_A_test',
        otp: '123456',
        deviceToken: `dt_device_A_${i}`,
        deviceId: `dt_device_A_${i}`
      })
    }).then(r => r.status).catch(() => 500)
  );
  const sessionB_Reqs = Array.from({ length: 25 }).map((_, i) =>
    fetch(`${BASE_URL}/api/attendance/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session_B_test',
        otp: '654321',
        deviceToken: `dt_device_B_${i}`,
        deviceId: `dt_device_B_${i}`
      })
    }).then(r => r.status).catch(() => 500)
  );

  const attResults = await Promise.all([...sessionA_Reqs, ...sessionB_Reqs]);
  const attTime = Date.now() - attStart;
  console.log(`   --> Completed in ${attTime}ms | Total Requests: 50 | Avg Latency: ${Math.round(attTime / 50)}ms`);

  console.log('\n================================================================');
  console.log('✅ EMPIRICAL TEST EXECUTION COMPLETE');
  console.log('================================================================');
}

runEmpiricalLoadTest().catch(console.error);
