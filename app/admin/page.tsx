'use client';

import React, { useState, useEffect, useMemo } from 'react';

interface Question {
  id: number; // question_num
  question: string;
  options: string[];
  answer: number;
}

interface ExamDatabase {
  [key: string]: Question[];
}

export default function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Questions database
  const [db, setDb] = useState<ExamDatabase>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected state
  const [selectedExamId, setSelectedExamId] = useState('de_1');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals / Edit Forms
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editQuestionText, setEditQuestionText] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editAnswer, setEditAnswer] = useState(0);

  // Add Question State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newOptions, setNewOptions] = useState<string[]>(['', '', '', '']);
  const [newAnswer, setNewAnswer] = useState(0);

  // Create/Delete Exam State
  const [isCreateExamModalOpen, setIsCreateExamModalOpen] = useState(false);
  const [newExamId, setNewExamId] = useState('');
  const [newExamIdError, setNewExamIdError] = useState('');

  // Status/Alert messages
  const [alertMsg, setAlertMsg] = useState({ type: '', text: '' });

  // Load password from session storage if exists
  useEffect(() => {
    const saved = sessionStorage.getItem('adminPassword');
    if (saved) {
      setPassword(saved);
      setIsLoggedIn(true);
    }
  }, []);

  // Fetch all questions
  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/questions');
      if (!res.ok) throw new Error('Không thể tải danh sách câu hỏi từ database.');
      const data = await res.json();
      setDb(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Lỗi bất ngờ xảy ra.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchQuestions();
    }
  }, [isLoggedIn]);

  // Handle simple login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setLoginError('Vui lòng nhập mật khẩu.');
      return;
    }
    setLoginError('');
    try {
      const res = await fetch('/api/admin/update-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action: 'verify',
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Mật khẩu không chính xác.');
      }
      // Set logged in state and save password to sessionStorage
      sessionStorage.setItem('adminPassword', password);
      setIsLoggedIn(true);
    } catch (err: any) {
      setLoginError(err.message || 'Mật khẩu không chính xác.');
      sessionStorage.removeItem('adminPassword');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminPassword');
    setIsLoggedIn(false);
    setPassword('');
    setDb({});
  };

  // Helper to show brief alerts
  const showAlert = (type: 'success' | 'error', text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => {
      setAlertMsg({ type: '', text: '' });
    }, 4000);
  };

  // Open Edit Modal
  const handleOpenEdit = (q: Question) => {
    setEditingQuestion(q);
    setEditQuestionText(q.question);
    setEditOptions([...q.options]);
    setEditAnswer(q.answer);
    setIsEditModalOpen(true);
  };

  // Save Edited Question
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;

    if (!editQuestionText.trim()) {
      showAlert('error', 'Nội dung câu hỏi không được để trống.');
      return;
    }

    const filteredOptions = editOptions.map(o => o.trim()).filter(Boolean);
    if (filteredOptions.length < 2) {
      showAlert('error', 'Phải có ít nhất 2 đáp án.');
      return;
    }

    try {
      const res = await fetch('/api/admin/update-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action: 'update',
          exam_id: selectedExamId,
          question_num: editingQuestion.id,
          question: editQuestionText.trim(),
          options: editOptions.map(o => o.trim()),
          answer: editAnswer,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          handleLogout();
        }
        throw new Error(result.error || 'Cập nhật thất bại.');
      }

      showAlert('success', `Đã cập nhật câu hỏi số ${editingQuestion.id} thành công!`);
      setIsEditModalOpen(false);
      setEditingQuestion(null);
      fetchQuestions(); // Refresh
    } catch (err: any) {
      showAlert('error', err.message || 'Lỗi kết nối.');
    }
  };

  // Add Option to edit fields
  const handleAddEditOption = () => {
    setEditOptions([...editOptions, '']);
  };

  // Remove Option from edit fields
  const handleRemoveEditOption = (idx: number) => {
    if (editOptions.length <= 2) {
      showAlert('error', 'Phải có ít nhất 2 đáp án.');
      return;
    }
    const next = [...editOptions];
    next.splice(idx, 1);
    setEditOptions(next);
    if (editAnswer >= next.length) {
      setEditAnswer(next.length - 1);
    }
  };

  // Open Add Question Modal
  const handleOpenAdd = () => {
    setNewQuestionText('');
    setNewOptions(['', '', '', '']);
    setNewAnswer(0);
    setIsAddModalOpen(true);
  };

  // Save New Question
  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newQuestionText.trim()) {
      showAlert('error', 'Nội dung câu hỏi không được để trống.');
      return;
    }

    const filteredOptions = newOptions.map(o => o.trim()).filter(Boolean);
    if (filteredOptions.length < 2) {
      showAlert('error', 'Phải có ít nhất 2 đáp án.');
      return;
    }

    try {
      const res = await fetch('/api/admin/update-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action: 'create',
          exam_id: selectedExamId,
          question: newQuestionText.trim(),
          options: newOptions.map(o => o.trim()),
          answer: newAnswer,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          handleLogout();
        }
        throw new Error(result.error || 'Không thể thêm câu hỏi mới.');
      }

      showAlert('success', `Đã thêm câu hỏi mới vào ${selectedExamId.toUpperCase()} thành công!`);
      setIsAddModalOpen(false);
      fetchQuestions(); // Refresh
    } catch (err: any) {
      showAlert('error', err.message || 'Lỗi kết nối.');
    }
  };

  // Dynamic Options changes for New Question
  const handleNewOptionChange = (idx: number, val: string) => {
    const next = [...newOptions];
    next[idx] = val;
    setNewOptions(next);
  };

  const handleAddNewOptionField = () => {
    setNewOptions([...newOptions, '']);
  };

  const handleRemoveNewOptionField = (idx: number) => {
    if (newOptions.length <= 2) {
      showAlert('error', 'Phải có ít nhất 2 đáp án.');
      return;
    }
    const next = [...newOptions];
    next.splice(idx, 1);
    setNewOptions(next);
    if (newAnswer >= next.length) {
      setNewAnswer(next.length - 1);
    }
  };

  // Delete Question
  const handleDeleteQuestion = async (qNum: number) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa Câu hỏi số ${qNum} không? Hành động này không thể hoàn tác.`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/update-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action: 'delete',
          exam_id: selectedExamId,
          question_num: qNum,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          handleLogout();
        }
        throw new Error(result.error || 'Xóa câu hỏi thất bại.');
      }

      showAlert('success', `Đã xóa câu hỏi số ${qNum} thành công!`);
      fetchQuestions(); // Refresh
    } catch (err: any) {
      showAlert('error', err.message || 'Lỗi kết nối.');
    }
  };

  // Create Exam
  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newExamId.trim();

    if (!trimmed) {
      setNewExamIdError('Vui lòng nhập tên đề thi.');
      return;
    }

    setNewExamIdError('');

    try {
      const res = await fetch('/api/admin/manage-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action: 'create_exam',
          exam_id: trimmed,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        if (res.status === 401) handleLogout();
        throw new Error(result.error || 'Không thể tạo đề thi mới.');
      }

      showAlert('success', `Đã tạo đề "${trimmed.toUpperCase().replace('_', ' ')}" thành công!`);
      setIsCreateExamModalOpen(false);
      setNewExamId('');
      setSelectedExamId(trimmed);
      fetchQuestions();
    } catch (err: any) {
      showAlert('error', err.message || 'Lỗi kết nối.');
    }
  };

  // Delete Exam (all questions in it)
  const handleDeleteExam = async () => {
    if (!window.confirm(`Bạn có chắc muốn XÓA TOÀN BỘ đề "${selectedExamId.toUpperCase().replace('_', ' ')}" (${(db[selectedExamId] || []).length} câu hỏi)? Hành động này KHÔNG THỂ hoàn tác!`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/manage-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action: 'delete_exam',
          exam_id: selectedExamId,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        if (res.status === 401) handleLogout();
        throw new Error(result.error || 'Xóa đề thi thất bại.');
      }

      showAlert('success', `Đã xóa đề "${selectedExamId.toUpperCase().replace('_', ' ')}" thành công!`);
      fetchQuestions();
      // Switch to first remaining exam
      const remaining = examIds.filter(id => id !== selectedExamId);
      if (remaining.length > 0) setSelectedExamId(remaining[0]);
    } catch (err: any) {
      showAlert('error', err.message || 'Lỗi kết nối.');
    }
  };

  // Filtered lists of exams
  const examIds = useMemo(() => {
    const keys = Object.keys(db);
    if (keys.length === 0) {
      // Fallback range if db is empty
      return Array.from({ length: 12 }, (_, i) => `de_${i + 1}`);
    }
    // Sort keys logically: de_1, de_2 ... de_10, de_11
    return keys.sort((a, b) => {
      const numA = parseInt(a.replace('de_', ''), 10);
      const numB = parseInt(b.replace('de_', ''), 10);
      return numA - numB;
    });
  }, [db]);

  // Questions filtered by search keyword
  const currentQuestions = useMemo(() => {
    const list = db[selectedExamId] || [];
    if (!searchTerm.trim()) return list;

    const term = searchTerm.toLowerCase();
    return list.filter(q =>
      q.question.toLowerCase().includes(term) ||
      q.options.some(opt => opt.toLowerCase().includes(term))
    );
  }, [db, selectedExamId, searchTerm]);

  // ----------------------------------------------------
  // LOGIN SCREEN
  // ----------------------------------------------------
  if (!isLoggedIn) {
    return (
      <div
        className="notranslate"
        translate="no"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #fff5ed 0%, #ff66000c 100%)',
          fontFamily: 'var(--font-body)',
          padding: '24px 16px'
        }}
      >
        <div style={{
          width: '100%',
          maxWidth: '440px',
          background: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 10px 40px rgba(255, 102, 0, 0.08)',
          border: '1px solid rgba(255, 102, 0, 0.1)',
          padding: '40px 32px',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '24px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'var(--primary-light)',
              color: 'var(--primary-color)',
              fontSize: '2rem',
              fontWeight: 800,
              marginBottom: '16px'
            }}>
              H
            </span>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--secondary-color)', margin: '0 0 8px 0' }}>
              Hanwha Life <span style={{ color: 'var(--primary-color)' }}>Admin</span>
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
              Đăng nhập để quản lý câu hỏi & đáp án thi đại lý
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <label htmlFor="pwd" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px' }}>
                Mật khẩu quản trị
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="pwd"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nhập mật khẩu Admin..."
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 16px',
                    borderRadius: '12px',
                    border: '1.5px solid var(--border-color)',
                    fontSize: '1rem',
                    outline: 'none',
                    transition: 'all 0.2s',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--primary-color)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                  }}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
              {loginError && (
                <p style={{ color: 'var(--error-color)', fontSize: '0.8rem', fontWeight: 600, marginTop: '8px', margin: 0 }}>
                  ⚠️ {loginError}
                </p>
              )}
            </div>

            <button type="submit" style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              background: 'var(--primary-color)',
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255, 102, 0, 0.2)',
              transition: 'var(--transition)'
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-color)'}
            >
              Đăng Nhập
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // MAIN ADMIN DASHBOARD
  // ----------------------------------------------------
  return (
    <div
      className="notranslate"
      translate="no"
      style={{
        minHeight: '100vh',
        background: 'var(--bg-body)',
        fontFamily: 'var(--font-body)',
        padding: '24px 16px',
        position: 'relative'
      }}
    >
      {/* Alert toast notification */}
      {alertMsg.text && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          padding: '16px 24px',
          borderRadius: '12px',
          color: '#ffffff',
          fontWeight: 700,
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: alertMsg.type === 'success' ? 'var(--success-color)' : 'var(--error-color)',
          transition: 'all 0.3s'
        }}>
          <span>{alertMsg.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{alertMsg.text}</span>
        </div>
      )}

      {/* Admin Header */}
      <header style={{
        maxWidth: '1200px',
        margin: '0 auto 24px auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        background: '#ffffff',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
            Quản trị viên <span style={{ color: 'var(--primary-color)' }}>Hanwha Life Exam</span>
          </h1>

        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.85rem',
            padding: '6px 12px',
            borderRadius: '8px',
            background: 'var(--primary-light)',
            color: 'var(--primary-color)',
            fontWeight: 700
          }}>
            Admin
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#f1f5f9',
              color: '#475569',
              fontSize: '0.88rem',
              fontWeight: 700,
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              transition: 'var(--transition)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--error-light)';
              e.currentTarget.style.color = 'var(--error-color)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.color = '#475569';
            }}
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Navigation & Actions Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          {/* List of Exams header with create button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
              Chọn Đề Thi
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setNewExamId('');
                  setNewExamIdError('');
                  setIsCreateExamModalOpen(true);
                }}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: 'var(--success-color)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'var(--transition)'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <span style={{ fontSize: '1rem' }}>+</span> Tạo đề mới
              </button>
              {examIds.includes(selectedExamId) && (
                <button
                  onClick={handleDeleteExam}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    background: '#f1f5f9',
                    color: 'var(--error-color)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'var(--transition)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--error-light)';
                    e.currentTarget.style.borderColor = 'var(--error-color)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#f1f5f9';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                >
                  🗑️ Xóa đề này
                </button>
              )}
            </div>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
            gap: '8px',
            marginBottom: '20px'
          }}>
            {examIds.map(id => {
              const active = id === selectedExamId;
              const count = db[id] ? db[id].length : 0;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedExamId(id)}
                  style={{
                    padding: '10px 6px',
                    borderRadius: '10px',
                    border: '1px solid ' + (active ? 'var(--primary-color)' : 'var(--border-color)'),
                    background: active ? 'var(--primary-color)' : '#ffffff',
                    color: active ? '#ffffff' : 'var(--text-main)',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: active ? '0 4px 10px rgba(255, 102, 0, 0.2)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>{id.toUpperCase().replace('_', ' ')}</span>
                  <span style={{
                    fontSize: '0.72rem',
                    opacity: 0.8,
                    background: active ? 'rgba(255,255,255,0.25)' : 'var(--bg-body)',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    {count} câu
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-color)'
          }}>
            {/* Search Bar */}
            <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
              <input
                type="text"
                placeholder="Tìm câu hỏi/đáp án..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.88rem',
                  outline: 'none',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: 'var(--text-muted)',
                    fontWeight: 700
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Add new question button */}
            <button
              onClick={handleOpenAdd}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                background: 'var(--primary-color)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.88rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 10px rgba(255, 102, 0, 0.15)',
                transition: 'var(--transition)'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-color)'}
            >
              <span style={{ fontSize: '1.1rem' }}>+</span> Thêm câu hỏi vào đề
            </button>
          </div>
        </div>

        {/* List of current questions */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
              Danh sách câu hỏi: <span style={{ color: 'var(--primary-color)' }}>{selectedExamId.toUpperCase().replace('_', ' ')}</span>
            </h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Hiển thị: {currentQuestions.length} / {(db[selectedExamId] || []).length} câu hỏi
            </span>
          </div>

          {loading ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 24px',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              fontSize: '1rem',
              fontWeight: 600
            }}>
              Đang tải danh sách câu hỏi từ Supabase...
            </div>
          ) : error ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 24px',
              background: 'var(--error-light)',
              borderRadius: '16px',
              border: '1px solid var(--error-color)',
              color: 'var(--error-color)',
              fontWeight: 600
            }}>
              Lỗi: {error}
              <br />
              <button onClick={fetchQuestions} style={{
                marginTop: '12px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'var(--error-color)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer'
              }}>
                Thử lại
              </button>
            </div>
          ) : currentQuestions.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 24px',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              fontSize: '1rem',
              fontWeight: 600
            }}>
              {searchTerm ? 'Không tìm thấy câu hỏi khớp với từ khóa của bạn.' : 'Chưa có câu hỏi nào trong đề thi này.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {currentQuestions.map((q) => (
                <div
                  key={q.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid var(--border-color)',
                    padding: '24px',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'var(--transition)'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '16px',
                    marginBottom: '14px',
                    borderBottom: '1px solid #f1f5f9',
                    paddingBottom: '12px'
                  }}>
                    <span style={{
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      color: 'var(--primary-color)',
                      background: 'var(--primary-light)',
                      padding: '4px 10px',
                      borderRadius: '6px'
                    }}>
                      Câu {q.id}
                    </span>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleOpenEdit(q)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: '#f1f5f9',
                          color: 'var(--info-color)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          transition: 'var(--transition)'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--info-light)'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                      >
                        Sửa Câu Hỏi
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: '#f1f5f9',
                          color: 'var(--error-color)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          transition: 'var(--transition)'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--error-light)'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>

                  <p style={{
                    fontWeight: 700,
                    fontSize: '1.05rem',
                    color: 'var(--secondary-color)',
                    marginBottom: '16px',
                    lineHeight: '1.5'
                  }}>
                    {q.question}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = optIdx === q.answer;
                      return (
                        <div
                          key={optIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            background: isCorrect ? 'var(--success-light)' : 'transparent',
                            border: '1px solid ' + (isCorrect ? 'var(--success-color)' : 'var(--border-color)'),
                            fontSize: '0.9rem'
                          }}
                        >
                          <span className="notranslate" translate="no" style={{
                            fontWeight: 800,
                            marginRight: '10px',
                            color: isCorrect ? 'var(--success-color)' : 'var(--text-muted)'
                          }}>
                            {String.fromCharCode(65 + optIdx)}.
                          </span>
                          <span style={{
                            color: isCorrect ? '#166534' : 'var(--text-main)',
                            fontWeight: isCorrect ? 600 : 400
                          }}>
                            {opt}
                          </span>
                          {isCorrect && (
                            <span style={{
                              marginLeft: 'auto',
                              fontSize: '0.72rem',
                              color: 'var(--success-color)',
                              background: '#ffffff',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--success-color)',
                              fontWeight: 800
                            }}>
                              ĐÁP ÁN ĐÚNG
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ----------------------------------------------------
          MODAL: EDIT QUESTION
          ---------------------------------------------------- */}
      {isEditModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1px solid var(--border-color)',
            animation: 'fadeIn 0.2s'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)'
            }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
                Chỉnh sửa Câu {editingQuestion?.id} - {selectedExamId.toUpperCase().replace('_', ' ')}
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
              >
                &times;
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Question text */}
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '8px' }}>
                    Nội dung câu hỏi
                  </label>
                  <textarea
                    rows={4}
                    value={editQuestionText}
                    onChange={e => setEditQuestionText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: '1.5px solid var(--border-color)',
                      fontSize: '0.95rem',
                      outline: 'none',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Options list */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', margin: 0 }}>
                      Danh sách các đáp án (Tích chọn nút tròn ở đáp án đúng)
                    </label>
                    <button
                      type="button"
                      onClick={handleAddEditOption}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-color)',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      + Thêm phương án
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {editOptions.map((opt, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Radio select correct answer */}
                        <input
                          type="radio"
                          name="correct-answer-radio"
                          checked={editAnswer === idx}
                          onChange={() => setEditAnswer(idx)}
                          style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer',
                            accentColor: 'var(--primary-color)'
                          }}
                        />

                        <span className="notranslate" translate="no" style={{ fontWeight: 800, fontSize: '0.9rem', width: '20px' }}>
                          {String.fromCharCode(65 + idx)}.
                        </span>

                        {/* Input option text */}
                        <input
                          type="text"
                          value={opt}
                          onChange={e => {
                            const next = [...editOptions];
                            next[idx] = e.target.value;
                            setEditOptions(next);
                          }}
                          placeholder={`Đáp án ${String.fromCharCode(65 + idx)}...`}
                          style={{
                            flex: 1,
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: '1.5px solid var(--border-color)',
                            fontSize: '0.88rem',
                            outline: 'none'
                          }}
                        />

                        {/* Remove option */}
                        <button
                          type="button"
                          onClick={() => handleRemoveEditOption(idx)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--error-color)',
                            fontSize: '1.1rem',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          title="Xóa phương án này"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Actions Footer */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                padding: '16px 24px',
                borderTop: '1px solid var(--border-color)',
                background: '#f8fafc',
                borderBottomLeftRadius: '20px',
                borderBottomRightRadius: '20px'
              }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    background: '#e2e8f0',
                    color: '#475569',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    background: 'var(--primary-color)',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          MODAL: ADD NEW QUESTION
          ---------------------------------------------------- */}
      {isAddModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1px solid var(--border-color)',
            animation: 'fadeIn 0.2s'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)'
            }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
                Thêm Câu Hỏi Mới - Đề {selectedExamId.toUpperCase().replace('DE_', '')}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
              >
                &times;
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveAdd} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Question text */}
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '8px' }}>
                    Nội dung câu hỏi
                  </label>
                  <textarea
                    rows={4}
                    value={newQuestionText}
                    onChange={e => setNewQuestionText(e.target.value)}
                    placeholder="Nhập nội dung câu hỏi mới..."
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: '1.5px solid var(--border-color)',
                      fontSize: '0.95rem',
                      outline: 'none',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Options list */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', margin: 0 }}>
                      Danh sách các đáp án (Tích chọn nút tròn ở đáp án đúng)
                    </label>
                    <button
                      type="button"
                      onClick={handleAddNewOptionField}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-color)',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      + Thêm phương án
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {newOptions.map((opt, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Radio select correct answer */}
                        <input
                          type="radio"
                          name="correct-answer-new-radio"
                          checked={newAnswer === idx}
                          onChange={() => setNewAnswer(idx)}
                          style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer',
                            accentColor: 'var(--primary-color)'
                          }}
                        />

                        <span className="notranslate" translate="no" style={{ fontWeight: 800, fontSize: '0.9rem', width: '20px' }}>
                          {String.fromCharCode(65 + idx)}.
                        </span>

                        {/* Input option text */}
                        <input
                          type="text"
                          value={opt}
                          onChange={e => handleNewOptionChange(idx, e.target.value)}
                          placeholder={`Đáp án ${String.fromCharCode(65 + idx)}...`}
                          style={{
                            flex: 1,
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: '1.5px solid var(--border-color)',
                            fontSize: '0.88rem',
                            outline: 'none'
                          }}
                        />

                        {/* Remove option */}
                        <button
                          type="button"
                          onClick={() => handleRemoveNewOptionField(idx)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--error-color)',
                            fontSize: '1.1rem',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          title="Xóa phương án này"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Actions Footer */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                padding: '16px 24px',
                borderTop: '1px solid var(--border-color)',
                background: '#f8fafc',
                borderBottomLeftRadius: '20px',
                borderBottomRightRadius: '20px'
              }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    background: '#e2e8f0',
                    color: '#475569',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    background: 'var(--primary-color)',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Thêm Câu Hỏi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          MODAL: CREATE NEW EXAM
          ---------------------------------------------------- */}
      {isCreateExamModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1px solid var(--border-color)',
            animation: 'fadeIn 0.2s'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)'
            }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
                Tạo Đề Thi Mới
              </h3>
              <button
                onClick={() => setIsCreateExamModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
              >
                &times;
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateExam}>
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '8px' }}>
                    Tên đề thi
                  </label>
                  <input
                    type="text"
                    value={newExamId}
                    onChange={e => {
                      setNewExamId(e.target.value);
                      setNewExamIdError('');
                    }}
                    placeholder="Ví dụ: Đề 13, Đề Thử Nghiệm..."
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: '1.5px solid ' + (newExamIdError ? 'var(--error-color)' : 'var(--border-color)'),
                      fontSize: '1rem',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--primary-color)'}
                    onBlur={e => e.target.style.borderColor = newExamIdError ? 'var(--error-color)' : 'var(--border-color)'}
                  />
                  {newExamIdError && (
                    <p style={{ color: 'var(--error-color)', fontSize: '0.8rem', fontWeight: 600, marginTop: '6px', marginBottom: 0 }}>
                      ⚠️ {newExamIdError}
                    </p>
                  )}
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px', marginBottom: 0 }}>
                    Nhập tên bất kỳ. Ví dụ: <strong>Đề 13</strong>, <strong>Đề Thử Nghiệm</strong>.
                  </p>
                </div>

                <div style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: 'var(--primary-light)',
                  border: '1px solid rgba(255, 102, 0, 0.15)',
                  fontSize: '0.82rem',
                  color: '#7c3d00',
                  lineHeight: '1.6'
                }}>
                  📝 Đề mới sẽ được tạo với <strong>1 câu hỏi mẫu</strong>. Bạn có thể sửa hoặc xóa câu đó sau khi tạo xong.
                </div>
              </div>

              {/* Footer */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                padding: '16px 24px',
                borderTop: '1px solid var(--border-color)',
                background: '#f8fafc',
                borderBottomLeftRadius: '20px',
                borderBottomRightRadius: '20px'
              }}>
                <button
                  type="button"
                  onClick={() => setIsCreateExamModalOpen(false)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    background: '#e2e8f0',
                    color: '#475569',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    background: 'var(--success-color)',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Tạo Đề Thi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
