import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password, action, exam_id, question_num, question, options, answer } = body;

    // Validate admin password
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || password !== adminPassword) {
      return NextResponse.json({ error: 'Unauthorized: Incorrect Admin Password' }, { status: 401 });
    }

    if (!exam_id) {
      return NextResponse.json({ error: 'exam_id is required' }, { status: 400 });
    }

    if (action === 'delete') {
      if (!question_num) {
        return NextResponse.json({ error: 'question_num is required for delete' }, { status: 400 });
      }
      
      const { error } = await supabaseAdmin
        .from('questions')
        .delete()
        .eq('exam_id', exam_id)
        .eq('question_num', question_num);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: 'Question deleted successfully' });
    }

    if (action === 'create') {
      if (!question || !options || answer === undefined) {
        return NextResponse.json({ error: 'question, options, and answer are required for creation' }, { status: 400 });
      }

      // Find the next question_num for this exam_id to auto-increment it
      const { data: lastQuestion, error: fetchError } = await supabaseAdmin
        .from('questions')
        .select('question_num')
        .eq('exam_id', exam_id)
        .order('question_num', { ascending: false })
        .limit(1);

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }

      const nextNum = lastQuestion && lastQuestion.length > 0 ? lastQuestion[0].question_num + 1 : 1;

      const { error: insertError } = await supabaseAdmin
        .from('questions')
        .insert({
          exam_id,
          question_num: nextNum,
          question,
          options,
          answer
        });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Question created successfully', question_num: nextNum });
    }

    // Default action: update existing question
    if (!question_num) {
      return NextResponse.json({ error: 'question_num is required for update' }, { status: 400 });
    }

    const updateFields: Record<string, any> = {};
    if (question !== undefined) updateFields.question = question;
    if (options !== undefined) updateFields.options = options;
    if (answer !== undefined) updateFields.answer = answer;

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'No fields to update specified' }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('questions')
      .update(updateFields)
      .eq('exam_id', exam_id)
      .eq('question_num', question_num);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Question updated successfully' });
  } catch (error: any) {
    console.error('API Error in POST /api/admin/update-question:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
