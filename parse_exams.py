# -*- coding: utf-8 -*-
import json
import re
import os

def parse_txt_to_json(input_path, output_path):
    if not os.path.exists(input_path):
        print(f"Lỗi: Không tìm thấy file {input_path}")
        return False
        
    with open(input_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Split content by exams
    # Match patterns like "ĐỀ THI SỐ: X" or "ĐỀ THI SỐ X"
    exam_sections = re.split(r'ĐỀ THI SỐ:\s*\d+|ĐỀ THI SỐ\s*\d+', content, flags=re.IGNORECASE)
    exam_headers = re.findall(r'(ĐỀ THI SỐ:\s*\d+|ĐỀ THI SỐ\s*\d+)', content, flags=re.IGNORECASE)
    
    # We want to match headers to their sections
    # Note: re.split leaves a leading empty section if the string starts with a match
    if len(exam_sections) > 0 and not exam_sections[0].strip():
        exam_sections = exam_sections[1:]
        
    print(f"Tìm thấy {len(exam_sections)} phần đề thi.")
    
    exams_data = {}
    
    for i, sec in enumerate(exam_sections):
        exam_index = i + 1
        exam_key = f"de_{exam_index}"
        
        # Split section into questions and the final answer sheet
        # Split by "ĐÁP ÁN ĐỀ"
        parts = re.split(r'ĐÁP ÁN ĐỀ\s*\d+|ĐÁP ÁN ĐỀ THI SỐ\s*\d+', sec, flags=re.IGNORECASE)
        questions_text = parts[0]
        answer_sheet_text = parts[1] if len(parts) > 1 else ""
        
        # Parse questions
        # Match "Câu hỏi số X:" or "Câu hỏi X:" or "Câu X:"
        q_blocks = re.split(r'Câu hỏi số\s*\d+:|Câu hỏi\s*\d+:|Câu\s*\d+:', questions_text, flags=re.IGNORECASE)
        if len(q_blocks) > 0 and not q_blocks[0].strip():
            q_blocks = q_blocks[1:]
            
        questions = []
        for q_idx, q_block in enumerate(q_blocks):
            lines = [l.strip() for l in q_block.strip().split('\n') if l.strip()]
            if not lines:
                continue
                
            question_text = lines[0]
            options = []
            answer_letter = None
            
            # Extract options (A., B., C., D., E.)
            for line in lines[1:]:
                # Check for options
                opt_match = re.match(r'^([A-F])\.\s*(.*)', line, flags=re.IGNORECASE)
                if opt_match:
                    options.append(opt_match.group(2).strip())
                else:
                    # Check if this line specifies the answer directly (e.g., "C đúng", "A đúng")
                    ans_match = re.match(r'^([A-F])\s+đúng', line, flags=re.IGNORECASE)
                    if ans_match:
                        answer_letter = ans_match.group(1).upper()
            
            # Map letter to index
            answer_idx = -1
            if answer_letter:
                answer_idx = ord(answer_letter) - ord('A')
                
            questions.append({
                "id": q_idx + 1,
                "question": question_text,
                "options": options,
                "answer": answer_idx
            })
            
        # Parse master answer sheet if available
        if answer_sheet_text:
            # Find all patterns like "Câu 1: C" or "Câu 1: A"
            ans_pairs = re.findall(r'Câu\s*(\d+)[:\s\-]+([A-F])', answer_sheet_text, flags=re.IGNORECASE)
            for q_num, letter in ans_pairs:
                idx = int(q_num) - 1
                if 0 <= idx < len(questions):
                    questions[idx]["answer"] = ord(letter.upper()) - ord('A')
                    
        # Filter out questions that have no correct answers defined
        for q in questions:
            if q["answer"] < 0 or q["answer"] >= len(q["options"]):
                # Default to 0 if not found, to avoid crash
                q["answer"] = 0
                
        exams_data[exam_key] = questions
        print(f"Đã xử lý ĐỀ {exam_index}: {len(questions)} câu hỏi.")
        
    with open(output_path, "w", encoding="utf-8") as out:
        json.dump(exams_data, out, ensure_ascii=False, indent=2)
        
    print(f"Đã xuất dữ liệu thành công ra file {output_path}!")
    return True

if __name__ == "__main__":
    parse_txt_to_json("/Volumes/D/code/hanwha-life/de_thi.txt", "/Volumes/D/code/hanwha-life/public/questions.json")
