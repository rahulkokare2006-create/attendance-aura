const BASE_URL = process.env.API_URL || 'http://168.231.103.71:3001';

async function runStressTest() {
  console.log('====================================================');
  console.log('🚀 ATTENDANCE AURA - 100-USER CONCURRENCY STRESS TEST');
  console.log(`Targeting Server: ${BASE_URL}`);
  console.log('====================================================\n');

  const numUsers = 100;
  const startOverall = Date.now();

  // STEP 1: 100 SIMULTANEOUS LOGINS
  console.log(`[TEST 1] Triggering ${numUsers} simultaneous logins from same IP...`);
  const loginStart = Date.now();
  const loginPromises = Array.from({ length: numUsers }).map(async (_, i) => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@gmail.com',
          password: 'password123',
          role: 'admin',
        })
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, status: res.status, data };
    } catch (err) {
      return { success: false, status: 500, error: err.message };
    }
  });

  const loginResults = await Promise.all(loginPromises);
  const loginDuration = Date.now() - loginStart;
  const loginSuccesses = loginResults.filter(r => r.success).length;
  const loginRateLimited = loginResults.filter(r => r.status === 429).length;

  console.log(`✅ Login Test Completed in ${loginDuration}ms`);
  console.log(`   Success Rate: ${loginSuccesses}/${numUsers} (${((loginSuccesses / numUsers) * 100).toFixed(1)}%)`);
  console.log(`   Rate-Limited (429): ${signupRateLimited = loginRateLimited}/${numUsers}`);
  console.log(`   Average Latency: ${Math.round(loginDuration / numUsers)}ms per req\n`);

  // STEP 2: 100 SIMULTANEOUS SIGNUPS
  console.log(`[TEST 2] Triggering ${numUsers} simultaneous student signups...`);
  const signupStart = Date.now();
  const signupPromises = Array.from({ length: numUsers }).map(async (_, i) => {
    const timestamp = Date.now();
    const email = `stress_student_${timestamp}_${i}@test.com`;
    const usn = `1ST${String(timestamp).slice(-5)}${String(i).padStart(2, '0')}`;
    try {
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Stress Student ${i}`,
          email,
          password: 'password123',
          role: 'student',
          phone: '9876543210',
          usn,
          branch: 'CSE',
          semester: '5',
          section: 'A',
          batch: '2022-2026',
        })
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, status: res.status, data };
    } catch (err) {
      return { success: false, status: 500, error: err.message };
    }
  });

  const signupResults = await Promise.all(signupPromises);
  const signupDuration = Date.now() - signupStart;
  const signupSuccesses = signupResults.filter(r => r.success).length;

  console.log(`✅ Signup Test Completed in ${signupDuration}ms`);
  console.log(`   Success Rate: ${signupSuccesses}/${numUsers} (${((signupSuccesses / numUsers) * 100).toFixed(1)}%)`);
  console.log(`   Average Latency: ${Math.round(signupDuration / numUsers)}ms per req\n`);

  const totalDuration = Date.now() - startOverall;
  console.log('====================================================');
  console.log(`🎉 OVERALL STRESS TEST COMPLETED in ${totalDuration}ms`);
  console.log('====================================================');
}

runStressTest().catch(console.error);
