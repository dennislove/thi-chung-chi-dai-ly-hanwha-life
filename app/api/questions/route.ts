import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: questions, error } = await supabaseAdmin
      .from('questions')
      .select('exam_id, question_num, question, options, answer')
      .order('exam_id', { ascending: true })
      .order('question_num', { ascending: true });

    if (error) {
      console.error('Error fetching questions from Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group questions by exam_id
    const grouped: Record<string, any[]> = {};
    
    questions.forEach(q => {
      if (!grouped[q.exam_id]) {
        grouped[q.exam_id] = [];
      }
      grouped[q.exam_id].push({
        id: q.question_num,
        question: q.question,
        options: q.options,
        answer: q.answer
      });
    });

    return NextResponse.json(grouped);
  } catch (error: any) {
    console.error('API Error in GET /api/questions:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
