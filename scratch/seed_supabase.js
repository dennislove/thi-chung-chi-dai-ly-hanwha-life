const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Manually parse .env file to load credentials
const envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  console.error('Error: .env file not found at project root!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    // Remove quotes if present
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL or SUPABASE_SERVICE_KEY not found in .env!');
  console.log('Loaded env keys:', Object.keys(env));
  process.exit(1);
}

console.log('Connecting to Supabase at:', supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
  const jsonPath = path.join(__dirname, '../public/questions.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: public/questions.json not found!');
    process.exit(1);
  }

  const fileData = fs.readFileSync(jsonPath, 'utf8');
  const questionsData = JSON.parse(fileData);

  // Prepare records for inserting
  const records = [];
  
  for (const [examId, questions] of Object.entries(questionsData)) {
    console.log(`Processing exam ${examId} with ${questions.length} questions...`);
    questions.forEach(q => {
      records.push({
        exam_id: examId,
        question_num: q.id,
        question: q.question,
        options: q.options, // JS client handles jsonb serialization
        answer: q.answer
      });
    });
  }

  console.log(`Total questions to insert: ${records.length}`);

  // Delete existing data to avoid duplicates if running multiple times
  console.log('Clearing existing questions in Supabase...');
  const { error: deleteError } = await supabase
    .from('questions')
    .delete()
    .neq('exam_id', 'none'); // Delete everything where exam_id is not 'none'
  
  if (deleteError) {
    console.error('Error clearing old questions:', deleteError.message);
    console.log('Check if you have created the table and database correctly.');
    process.exit(1);
  }
  console.log('Database cleared.');

  // Insert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    console.log(`Inserting batch ${i / batchSize + 1} (${batch.length} questions)...`);
    
    const { error } = await supabase
      .from('questions')
      .insert(batch);
      
    if (error) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, error.message);
      process.exit(1);
    }
  }

  console.log('Successfully seeded all questions to Supabase!');
}

seed().catch(err => {
  console.error('Unexpected error in seed execution:', err);
  process.exit(1);
});
