const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
const db = new DatabaseSync(dbPath);

// Look at assistant messages with model info
console.log('=== Assistant message data ===');
const msgs = db.prepare(`
  SELECT id, session_id, data 
  FROM message 
  WHERE json_extract(data, '$.role') = 'assistant'
  ORDER BY time_created DESC
  LIMIT 3
`).all();

for (const msg of msgs) {
  console.log('\n--- Message:', msg.id, '---');
  try {
    const data = JSON.parse(msg.data);
    console.log('Keys:', Object.keys(data));
    console.log('Role:', data.role);
    console.log('Model:', JSON.stringify(data.model));
    console.log('Cost:', data.cost);
    console.log('Tokens:', JSON.stringify(data.tokens));
    console.log('Finish:', data.finish);
    console.log('Time:', JSON.stringify(data.time));
    console.log('Parts count:', data.parts?.length ?? 0);
    if (data.parts && data.parts.length > 0) {
      console.log('First part keys:', Object.keys(data.parts[0]));
      console.log('First part:', JSON.stringify(data.parts[0]).substring(0, 300));
    }
  } catch (e) {
    console.log('Error parsing:', e.message);
    console.log('Raw:', msg.data.substring(0, 500));
  }
}

// Check if there are parts linked to assistant messages
console.log('\n=== Parts for assistant message ===');
try {
  const parts = db.prepare(`
    SELECT p.id, p.message_id, p.data 
    FROM part p
    JOIN message m ON p.message_id = m.id
    WHERE json_extract(m.data, '$.role') = 'assistant'
    LIMIT 3
  `).all();
  
  for (const part of parts) {
    console.log('\n--- Part:', part.id, '---');
    try {
      const data = JSON.parse(part.data);
      console.log('Type:', data.type);
      console.log('Keys:', Object.keys(data));
      if (data.cost !== undefined) console.log('Cost:', data.cost);
      if (data.tokens) console.log('Tokens:', JSON.stringify(data.tokens));
    } catch (e) {
      console.log('Raw:', part.data.substring(0, 300));
    }
  }
} catch (e) { console.log('ERROR:', e.message); }

// Check what columns have actual non-zero data in session
console.log('\n=== Sessions with cost > 0 ===');
const sessionsWithCost = db.prepare(`
  SELECT id, title, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, directory
  FROM session
  WHERE cost > 0 OR tokens_input > 0 OR tokens_output > 0
  LIMIT 5
`).all();

for (const s of sessionsWithCost) {
  console.log(JSON.stringify(s, null, 2));
}

// Get total stats
console.log('\n=== Totals ===');
const totals = db.prepare(`
  SELECT 
    COUNT(*) as total_sessions,
    SUM(cost) as total_cost,
    SUM(tokens_input) as total_input,
    SUM(tokens_output) as total_output,
    SUM(tokens_reasoning) as total_reasoning
  FROM session
`).get();
console.log(JSON.stringify(totals, null, 2));

// Models used (from message data)
console.log('\n=== Models used (from messages) ===');
try {
  const models = db.prepare(`
    SELECT 
      json_extract(data, '$.model.providerID') as provider,
      json_extract(data, '$.model.modelID') as model,
      COUNT(*) as cnt
    FROM message
    WHERE json_extract(data, '$.role') = 'assistant'
      AND json_extract(data, '$.model.modelID') IS NOT NULL
    GROUP BY provider, model
  `).all();
  for (const m of models) {
    console.log(`  ${m.provider}/${m.model}: ${m.cnt}`);
  }
} catch (e) { console.log('ERROR:', e.message); }

db.close();
