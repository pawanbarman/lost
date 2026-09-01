import dotenv from 'dotenv';
dotenv.config();

const BASE = 'http://localhost:5000/api';
const suffix = Date.now().toString().slice(-6);
const userA = { name: 'E2E Lost ' + suffix, email: 'e2e_lost_' + suffix + '@test.com', password: 'password123' };
const userB = { name: 'E2E Found ' + suffix, email: 'e2e_found_' + suffix + '@test.com', password: 'password123' };

let pass = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? ' -> ' + detail : '')); }
}

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}

async function register(u) {
  const res = await req('POST', '/auth/register', { name: u.name, email: u.email, password: u.password });
  if (res.status === 201 && res.json.token) {
    console.log('registered ' + u.email + ' (status ' + res.status + ')');
    return res.json.token;
  }
  console.log('register FAILED for ' + u.email + ' status=' + res.status + ' body=' + JSON.stringify(res.json));
  return null;
}

console.log('=== 4/5. Registration & Login ===');
const tokenA = await register(userA);
const tokenB = await register(userB);
check('Register user A', !!tokenA);
check('Register user B', !!tokenB);

let tokenA2 = null;
if (tokenA) {
  const login = await req('POST', '/auth/login', { email: userA.email, password: userA.password });
  check('Login user A returns token', login.status === 200 && !!login.json.token, 'status=' + login.status);
  tokenA2 = login.json.token || tokenA;
}
const badLogin = await req('POST', '/auth/login', { email: userA.email, password: 'wrongpass' });
check('Login rejects wrong password', badLogin.status === 401, 'status=' + badLogin.status);

console.log('=== 6. Create Lost Report (user A) ===');
const dt = new Date().toISOString();
const lostBody = {
  type: 'LOST',
  title: 'Black Leather Wallet ' + suffix,
  category: 'Wallet',
  description: 'A black leather wallet with a silver clasp that was left on the library table.',
  location: 'University Library',
  dateTime: dt,
  privateDetails: 'Contains a single brass house key and a transit card with serial A9K.',
  currentLocation: 'Lost and Found Office'
};
const lostRes = await req('POST', '/reports', lostBody, tokenA);
check('Create lost report', lostRes.status === 201 && lostRes.json.id, 'status=' + lostRes.status + ' ' + JSON.stringify(lostRes.json));
const lostReportId = lostRes.json ? lostRes.json.id : null;

console.log('=== 7. Create Found Report (user B) ===');
const foundBody = {
  type: 'FOUND',
  title: 'Black Leather Wallet',
  category: 'Wallet',
  description: 'Found a black leather wallet with a silver clasp on a library table.',
  location: 'University Library',
  dateTime: dt,
  privateDetails: 'Wallet contains a brass house key.',
  currentLocation: 'Lost and Found Office'
};
const foundRes = await req('POST', '/reports', foundBody, tokenB);
check('Create found report', foundRes.status === 201 && foundRes.json.id, 'status=' + foundRes.status + ' ' + JSON.stringify(foundRes.json));
const foundReportId = foundRes.json ? foundRes.json.id : null;

console.log('=== 8. Matching ===');
let lostMatchId = null, foundMatchId = null, matchScore = null;
if (tokenA) {
  const matches = await req('GET', '/matches', null, tokenA);
  const hasMatch = matches.status === 200 && matches.json.some(m =>
    (m.lostReport && m.lostReport.id === lostReportId) || (m.foundReport && m.foundReport.id === lostReportId)
  );
  check('Lost user sees a match for the new report', hasMatch, 'status=' + matches.status + ' n=' + (matches.json||[]).length);
  const m = (matches.json || []).find(x => (x.lostReport && x.lostReport.id === lostReportId) || (x.foundReport && x.foundReport.id === lostReportId));
  if (m) { lostMatchId = m.id; matchScore = m.score; console.log('      match score = ' + m.score + '%'); }
  check('Match score >= 60', matchScore !== null && matchScore >= 60, 'score=' + matchScore);
}

console.log('=== 9. Create Claim (user A on own lost match) ===');
let claimId = null;
if (lostMatchId && tokenA) {
  const claim = await req('POST', '/claims', {
    matchId: lostMatchId,
    verificationDetails: 'I lost the wallet at the library. It has a brass house key and a transit card with serial A9K.'
  }, tokenA);
  if (claim.status === 201) {
    claimId = claim.json.id;
    check('Create claim (status 201)', claim.status === 201);
    console.log('      claimId=' + claimId);
  } else {
    check('Create claim (status 201)', false, 'status=' + claim.status + ' ' + JSON.stringify(claim.json));
    // Some flows auto-derive match target; allow match-based lookup
  }
}

console.log('=== 10. Private details ownership ===');
if (tokenB) {
  const otherView = await req('GET', '/reports/' + lostReportId, null, tokenB);
  check('Non-owner cannot see private details', otherView.status === 200 && !otherView.json.item.privateDetails, 'privateDetails=' + otherView.json?.item?.privateDetails);
}
if (tokenA) {
  const ownerView = await req('GET', '/reports/' + lostReportId, null, tokenA);
  check('Owner can see private details', ownerView.status === 200 && !!ownerView.json.item.privateDetails);
}

console.log('=== 12. Notifications ===');
if (tokenA) {
  const notif = await req('GET', '/notifications', null, tokenA);
  check('Lost user has notifications', notif.status === 200 && notif.json.length > 0, 'status=' + notif.status + ' n=' + (notif.json||[]).length);
  if (notif.status === 200 && notif.json.find(n => n.message && n.message.includes('possible match'))) {
    check('Notification mentions possible match', true);
  }
}

console.log('=== 11/13. Match status authorization ===');
if (lostMatchId && tokenB) {
  const unauth = await req('PUT', '/matches/' + lostMatchId + '/status', { status: 'ACCEPTED' }, tokenB);
  check('Non-participant cannot update match status', unauth.status === 403, 'status=' + unauth.status + ' ' + JSON.stringify(unauth.json));
}

console.log('=== 13. Admin authorization ===');
const adminLogin = await req('POST', '/auth/login', { email: 'admin@leftbehind.com', password: 'admin123' });
const adminToken = adminLogin.json ? adminLogin.json.token : null;
if (adminToken) {
  const adminUsers = await req('GET', '/admin/users', null, adminToken);
  check('Admin can access admin users', adminUsers.status === 200, 'status=' + adminUsers.status);
  const nonAdminUsers = await req('GET', '/admin/users', null, tokenA);
  check('Non-admin blocked from admin users', nonAdminUsers.status === 403, 'status=' + nonAdminUsers.status);
} else {
  check('Admin login', false);
}

console.log('=== 14. Report flagging/moderation ===');
if (adminToken && lostReportId) {
  const flag = await req('PUT', '/admin/reports/' + lostReportId + '/flag', { reason: 'E2E test flag' }, adminToken);
  check('Admin flags report', flag.status === 200 && flag.json.isFlagged === true, 'status=' + flag.status + ' ' + JSON.stringify(flag.json));
  const flagged = await req('GET', '/admin/reports/flagged', null, adminToken);
  check('Flagged list contains report', flagged.status === 200 && flagged.json.some(r => r.id === lostReportId), 'status=' + flagged.status + ' n=' + (flagged.json||[]).length);
  const unflag = await req('PUT', '/admin/reports/' + lostReportId + '/unflag', {}, adminToken);
  check('Admin unflags report', unflag.status === 200 && unflag.json.isFlagged === false, 'status=' + unflag.status + ' ' + JSON.stringify(unflag.json));
}

console.log('=== 15. Event QR functionality ===');
try {
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent('http://localhost:5000/api/events/event-123');
  const qr = await fetch(qrUrl);
  check('QR endpoint reachable', qr.status === 200, 'status=' + qr.status);
} catch (e) {
  check('QR endpoint reachable', false, e.message);
}

console.log('=== 17. RETURNED/CLOSED status flow (admin) ===');
if (adminToken && lostReportId) {
  const toReturned = await req('PUT', '/admin/reports/' + lostReportId + '/status', { status: 'RETURNED' }, adminToken);
  check('Admin sets report RETURNED', toReturned.status === 200 && toReturned.json.status === 'RETURNED', 'status=' + toReturned.status + ' ' + JSON.stringify(toReturned.json));
  const toClosed = await req('PUT', '/admin/reports/' + lostReportId + '/status', { status: 'CLOSED' }, adminToken);
  check('Admin sets report CLOSED', toClosed.status === 200 && toClosed.json.status === 'CLOSED', 'status=' + toClosed.status + ' ' + JSON.stringify(toClosed.json));
  const invalid = await req('PUT', '/admin/reports/' + lostReportId + '/status', { status: 'LOST' }, adminToken);
  check('Invalid transition from CLOSED rejected', invalid.status === 400, 'status=' + invalid.status + ' ' + JSON.stringify(invalid.json));
}

console.log('');
console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
console.log('created john emails: ' + userA.email + ', ' + userB.email);
process.exit(fail > 0 ? 1 : 0);
