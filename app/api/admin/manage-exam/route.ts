import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password, action, exam_id } = body;

    // Validate admin password
    const adminPassword = process.env.ADMIN_PASSWORD;
    const cleanAdminPassword = adminPassword?.replace(/^['"]|['"]$/g, '');
    const cleanInputPassword = password?.replace(/^['"]|['"]$/g, '');

    if (!cleanAdminPassword) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin password is not configured on the server.' },
        { status: 401 }
      );
    }

    if (cleanInputPassword !== cleanAdminPassword) {
      return NextResponse.json({ error: 'Unauthorized: Incorrect Admin Password' }, { status: 401 });
    }

    if (!exam_id || typeof exam_id !== 'string' || !exam_id.trim()) {
      return NextResponse.json({ error: 'exam_id is required' }, { status: 400 });
    }

    const normalizedExamId = exam_id.trim();

    // ---- CREATE EXAM ----
    if (action === 'create_exam') {
      // Check if exam already exists
      const { data: existing, error: checkError } = await supabaseAdmin
        .from('questions')
        .select('exam_id')
        .eq('exam_id', normalizedExamId)
        .limit(1);

      if (checkError) {
        return NextResponse.json({ error: checkError.message }, { status: 500 });
      }

      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: `Đề thi "${normalizedExamId}" đã tồn tại.` },
          { status: 409 }
        );
      }

      // Insert a placeholder question so the exam_id appears in the list
      const { error: insertError } = await supabaseAdmin.from('questions').insert({
        exam_id: normalizedExamId,
        question_num: 1,
        question: 'Câu hỏi mẫu - hãy chỉnh sửa hoặc xóa câu này.',
        options: ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'],
        answer: 0,
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Đã tạo đề thi "${normalizedExamId}" thành công với 1 câu hỏi mẫu.`,
        exam_id: normalizedExamId,
      });
    }

    // ---- DELETE EXAM ----
    if (action === 'delete_exam') {
      const { error: deleteError } = await supabaseAdmin
        .from('questions')
        .delete()
        .eq('exam_id', normalizedExamId);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Đã xóa toàn bộ đề thi "${normalizedExamId}" thành công.`,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('API Error in POST /api/admin/manage-exam:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
