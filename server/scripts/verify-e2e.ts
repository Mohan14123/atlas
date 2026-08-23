async function verifyE2E() {
  const API_URL = 'http://localhost:4001/api/v1';

  try {
    console.log('1. Registering user...');
    const uid = Math.random().toString(36).substring(7);
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email: `test-${uid}@example.com`, password: 'password123', organization_name: `DefaultOrg-${uid}` })
    });
    const regJson = await regRes.json() as any;
    if (regRes.status !== 201) {
      console.error('Registration failed:', regJson);
      process.exit(1);
    }
    const { data: { token } } = regJson;

    console.log('2. Creating Org & Project...');
    const orgRes = await fetch(`${API_URL}/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: `Org-${uid}` })
    });
    const orgJson = await orgRes.json() as any;
    if (orgRes.status !== 201) throw new Error(`Org failed: ${JSON.stringify(orgJson)}`);
    console.log('Org JSON:', JSON.stringify(orgJson, null, 2));
    const orgId = orgJson.data.organization ? orgJson.data.organization.id : orgJson.data.id;

    const projRes = await fetch(`${API_URL}/organizations/${orgId}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: `Proj-${uid}` })
    });
    const projJson = await projRes.json() as any;
    if (projRes.status !== 201) throw new Error(`Proj failed: ${JSON.stringify(projJson)}`);
    console.log('Proj JSON:', JSON.stringify(projJson, null, 2));
    const projId = projJson.data.project ? projJson.data.project.id : projJson.data.id;

    console.log('3. Creating Queue...');
    const qRes = await fetch(`${API_URL}/organizations/${orgId}/projects/${projId}/queues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ project_id: projId, name: `Queue-${uid}`, concurrency_limit: 5 })
    });
    const qJson = await qRes.json() as any;
    if (qRes.status !== 201) throw new Error(`Queue failed: ${JSON.stringify(qJson)}`);
    console.log('Queue JSON:', JSON.stringify(qJson, null, 2));
    const queueId = qJson.data.queue ? qJson.data.queue.id : qJson.data.id;

    console.log('4. Submitting Job...');
    const jRes = await fetch(`${API_URL}/organizations/${orgId}/projects/${projId}/queues/${queueId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ queue_id: queueId, type: 'test', payload: { action: 'ping' }, job_mode: 'immediate' })
    });
    const jJson = await jRes.json() as any;
    if (jRes.status !== 201) throw new Error(`Job failed: ${JSON.stringify(jJson)}`);
    console.log('Job JSON:', JSON.stringify(jJson, null, 2));
    const jobId = jJson.data.job ? jJson.data.job.id : jJson.data.id;
    console.log(`Submitted Job ID: ${jobId}`);

    console.log('5. Waiting for Worker to process job...');
    let currentStatus = jJson.data.job ? jJson.data.job.status : jJson.data.status;
    let attempts = 0;
    while (currentStatus !== 'COMPLETED' && currentStatus !== 'FAILED' && attempts < 15) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const getRes = await fetch(`${API_URL}/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const getJson = await getRes.json() as any;
      if (getRes.status !== 200) throw new Error(`Get Job failed: ${JSON.stringify(getJson)}`);
      const fetchedJob = getJson.data.job ? getJson.data.job : getJson.data;
      currentStatus = fetchedJob.status;
      console.log(`Polling status: ${currentStatus}`);
      attempts++;
    }

    if (currentStatus === 'COMPLETED') {
      console.log('✅ End-to-end flow verified successfully!');
      process.exit(0);
    } else {
      console.error(`❌ Job failed to complete. Final status: ${currentStatus}`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Test script failed:', err);
    process.exit(1);
  }
}

verifyE2E();
