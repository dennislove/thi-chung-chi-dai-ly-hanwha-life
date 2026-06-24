'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

// Interfaces matching backend schema
interface RawQuestion {
  id: number;
  question: string;
  options: string[];
  answer: number;
}

interface ProcessedQuestion {
  id: number;
  questionText: string;
  options: string[];
  originalAnswer: number;
  correctAnswer: number;
  shuffled: boolean;
}

interface QuestionsDatabase {
  [key: string]: RawQuestion[];
}

interface UserInfo {
  name: string;
  phone: string;
  code: string;
}

const DEPENDENT_KEYWORDS = [
  /tất\s+cả/i,                      // Tất cả các đáp án/phương án...
  /đều\s+(đúng|sai)/i,               // đều đúng, đều sai
  /phương\s+án\s+trên/i,             // phương án trên, các phương án trên
  /đáp\s+án\s+trên/i,               // đáp án trên, các đáp án trên
  /câu\s+trên/i,                     // câu trên, các câu trên
  /không\s+câu\s+nào/i,              // không câu nào đúng/sai
  /không\s+có\s+trường\s+hợp/i,      // không có trường hợp nào
  /[a-d]\s*(?:,|và|hoặc)\s*[a-d]/i,  // A, B đúng; A,C sai; A hoặc B; A và C...
  /cả\s+[a-d]/i,                     // cả A và B, cả A, B, C...
];

export default function Home() {
  // Screens: 'auth' | 'dashboard' | 'exam' | 'result'
  const [screen, setScreen] = useState<'auth' | 'dashboard' | 'exam' | 'result'>('auth');

  // Registration State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Quiz database & setup
  const [questionsData, setQuestionsData] = useState<QuestionsDatabase | null>(null);
  const [mode, setMode] = useState<'luyen-thi' | 'thi-thu' | ''>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('de_1');
  const [currentExamQuestions, setCurrentExamQuestions] = useState<ProcessedQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);

  // Quiz tracking
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [isQuestionAnswered, setIsQuestionAnswered] = useState<Record<number, boolean>>({});
  const [viewedQuestions, setViewedQuestions] = useState<Record<number, boolean>>({});

  // Timer states
  const [timeLeft, setTimeLeft] = useState(3600); // 60 minutes
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [timeSpent, setTimeSpent] = useState(0);

  // Modals & effects
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [confettiList, setConfettiList] = useState<{ id: number; left: string; delay: string; color: string; size: string }[]>([]);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean metadata tag prefixes from question text
  const cleanQuestionText = (text: string): string => {
    const prefixRegex = /^(?:\[?Đề\s*\d+\s*-\s*Câu\s*(?:số\s*)?\d+\]?|Câu\s*\d+[:\s\-]*|\[?Câu\s*\d+\]?)\s*/i;
    return text.replace(prefixRegex, '').trim();
  };

  // Determine if answer options contain dependency words
  const hasDependentOptions = (options: string[]): boolean => {
    return options.some(opt => DEPENDENT_KEYWORDS.some(regex => regex.test(opt)));
  };

  // Fisher-Yates shuffle
  const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Fetch exam questions on load & register PWA Service Worker
  useEffect(() => {
    fetch('/questions.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load questions.');
        return res.json();
      })
      .then(data => setQuestionsData(data))
      .catch(err => console.error('Error fetching questions:', err));

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      if (isLocalhost) {
        // Unregister any active service worker in local dev mode to prevent HMR and hot-reload loops
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (const registration of registrations) {
            registration.unregister();
            console.log('SW: Unregistered service worker in local development mode to avoid dev caching loops.');
          }
        });
      } else {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker registered successfully!', reg.scope))
            .catch(err => console.error('Service Worker registration failed:', err));
        });
      }
    }
  }, []);

  // Timer interval controller
  useEffect(() => {
    if (screen === 'exam' && mode === 'thi-thu') {
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            handleSubmitExam(true); // Auto submit
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [screen, mode]);

  // Track viewed questions
  useEffect(() => {
    if (screen === 'exam' && currentExamQuestions.length > 0) {
      setViewedQuestions(prev => ({ ...prev, [currentQuestionIndex]: true }));
    }
  }, [currentQuestionIndex, screen, currentExamQuestions]);

  // Handles starting/preparing the exam
  const handleStartExam = () => {
    if (!questionsData || !questionsData[selectedExamId]) {
      alert('Dữ liệu bộ đề này chưa khả dụng.');
      return;
    }

    const rawList = questionsData[selectedExamId];

    // 1. Shuffling questions (Fisher-Yates)
    const shuffledQuestions = shuffleArray(rawList);

    // 2. Conditional Shuffling of answers
    const processed = shuffledQuestions.map((q, idx) => {
      const cleanText = cleanQuestionText(q.question);
      const shouldShuffle = !hasDependentOptions(q.options);

      let finalOptions = [...q.options];
      let correctIdx = q.answer;

      if (shouldShuffle) {
        const mapped = q.options.map((opt, i) => ({ text: opt, originalIndex: i }));
        const shuffledOptions = shuffleArray(mapped);

        finalOptions = shuffledOptions.map(item => item.text);
        correctIdx = shuffledOptions.findIndex(item => item.originalIndex === q.answer);
      }

      return {
        id: q.id || idx + 1,
        questionText: cleanText,
        options: finalOptions,
        originalAnswer: q.answer,
        correctAnswer: correctIdx,
        shuffled: shouldShuffle
      };
    });

    // Reset quiz stats
    setCurrentExamQuestions(processed);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setIsQuestionAnswered({});
    setViewedQuestions({ 0: true });
    setTimeLeft(3600); // 60 minutes
    setStartTime(new Date());
    setScreen('exam');
  };

  // Select Option Handler
  const handleSelectOption = (qIdx: number, optIdx: number) => {
    // Under Practice Mode, candidate cannot change answer once selected
    if (mode === 'luyen-thi' && userAnswers[qIdx] !== undefined) {
      return;
    }
    setUserAnswers(prev => ({ ...prev, [qIdx]: optIdx }));
    setIsQuestionAnswered(prev => ({ ...prev, [qIdx]: true }));
  };

  // Render navigation grid status classes
  const getGridItemClass = (idx: number) => {
    let base = 'grid-item';
    if (currentQuestionIndex === idx) base += ' active';

    if (userAnswers[idx] !== undefined) {
      base += ' answered-mock'; // Green cell for all answered questions in both modes
    } else if (viewedQuestions[idx]) {
      base += ' viewed-unanswered'; // Red cell for viewed but unanswered questions
    } else {
      base += ' unviewed'; // Gray cell for unviewed questions
    }
    return base;
  };

  // Submit and evaluate exam
  const handleSubmitExam = (force = false) => {
    if (!force) {
      setShowConfirmModal(true);
      return;
    }

    setShowConfirmModal(false);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    // Evaluate times
    const endTime = new Date();
    const elapsed = startTime ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) : 0;
    setTimeSpent(elapsed);

    // Calculate score
    let correct = 0;
    currentExamQuestions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctAnswer) correct++;
    });

    // Fireworks when passed (>= 35/40)
    if (correct >= 35) {
      triggerFireworks();
    }

    setScreen('result');
  };

  // Confetti triggering mechanism
  const triggerFireworks = () => {
    const list = Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100 + 'vw',
      delay: Math.random() * 2 + 's',
      color: ['#ff6600', '#ff9900', '#ffd700', '#2ecc71', '#3498db'][Math.floor(Math.random() * 5)],
      size: Math.random() * 8 + 6 + 'px'
    }));
    setConfettiList(list);

    // Clean up confetti after 5 seconds
    setTimeout(() => {
      setConfettiList([]);
    }, 5000);
  };

  const handleLoginAndMode = (selectedMode: 'luyen-thi' | 'thi-thu') => {
    if (username === '88888888' && password === '88888888') {
      setName('Học viên Hanwha');
      setPhone('88888888');
      setCode('HW88888888');
      setMode(selectedMode);
      setScreen('dashboard');
    } else {
      alert('Tài khoản hoặc mật khẩu không chính xác! Vui lòng sử dụng tài khoản "88888888" và mật khẩu "88888888".');
    }
  };

  // Calculate score values
  const scoreCorrectCount = currentExamQuestions.reduce((acc, q, idx) => {
    return userAnswers[idx] === q.correctAnswer ? acc + 1 : acc;
  }, 0);

  const isPassed = scoreCorrectCount >= 35;

  return (
    <div className="app-container">


      {/* CONFETTI ANIMATION PANELS */}
      {confettiList.map(item => (
        <div
          key={item.id}
          className="confetti"
          style={{
            left: item.left,
            animationDelay: item.delay,
            backgroundColor: item.color,
            width: item.size,
            height: item.size
          }}
        />
      ))}


      {screen === 'auth' && (
        <main className="screen active" style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>

          <div className="vidi-portal-banner" style={{
            background: 'linear-gradient(135deg, var(--primary-color) 0%, #ff8833 100%)',
            borderRadius: 'var(--radius-md)',
            padding: '40px 24px',
            textAlign: 'center',
            color: 'white',
            boxShadow: 'var(--shadow-md)',
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>

            {/* Corner Logo Badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              position: 'absolute',
              top: '20px',
              left: '20px'
            }} className="vidi-banner-header">
              <div style={{
                background: 'white',
                borderRadius: '8px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                <img src="/logo.svg" alt="Hanwha Logo" style={{ height: '24px', objectFit: 'contain' }} />
              </div>
            </div>

            {/* Portal Titles */}
            <div style={{ marginTop: '30px' }}>
              <p style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'rgba(255, 255, 255, 0.9)',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                marginBottom: '8px',
                textShadow: '0 1px 2px rgba(0,0,0,0.1)'
              }}>
                Hệ Thống Quản Lý
              </p>
              <h2 style={{
                fontFamily: 'var(--font-title)',
                fontSize: 'clamp(1.2rem, 4.5vw, 2.25rem)',
                fontWeight: 850,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                lineHeight: 1.2,
                textShadow: '0 2px 4px rgba(0,0,0,0.15)'
              }}>
                BỘ PHẬN HUẤN LUYỆN - KÊNH ĐẠI LÝ HANWHA LIFE VIỆT NAM
              </h2>
            </div>
          </div>

          {/* Three Landing Cards Grid */}
          <div className="landing-grid">
            {/* Column 1: HƯỚNG DẪN */}
            <div className="landing-card" onClick={() => setShowInstructionsModal(true)} style={{ cursor: 'pointer' }}>
              <h3 className="landing-card-title">HƯỚNG DẪN</h3>
              <div className="landing-card-icon">📋</div>
              <p className="landing-card-link">
                BẤM VÀO ĐÂY ĐỂ XEM HƯỚNG DẪN
              </p>
              <p className="landing-card-desc">
                Hướng dẫn thao tác làm bài thi, sơ đồ phím tắt và quy chế thi chứng chỉ đại lý bảo hiểm.
              </p>
            </div>

            {/* Column 2: HỌC VIÊN */}
            <div className="landing-card active-card">
              <h3 className="landing-card-title">HỌC VIÊN</h3>

              <form onSubmit={(e) => e.preventDefault()} style={{ marginTop: '16px', width: '100%' }}>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="username-input" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Tên đăng nhập</label>
                  <input
                    id="username-input"
                    type="text"
                    className="form-control"
                    placeholder="Nhập tên đăng nhập"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    style={{ padding: '10px 12px', fontSize: '0.9rem' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="password-input" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Mật khẩu</label>
                  <input
                    id="password-input"
                    type="password"
                    className="form-control"
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ padding: '10px 12px', fontSize: '0.9rem' }}
                  />
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px', textAlign: 'left', borderLeft: '3px solid var(--primary-color)', paddingLeft: '8px' }}>
                  (*) Đăng nhập bằng tài khoản/mật khẩu: <strong>88888888 (8 số 8)</strong>.
                </p>

                <div className="auth-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleLoginAndMode('luyen-thi')}
                    style={{ width: '100%', padding: '12px 16px', fontSize: '0.95rem', background: 'var(--primary-color)', color: 'white', fontWeight: 700 }}
                  >
                    📚 ĐĂNG NHẬP LUYỆN THI
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => handleLoginAndMode('thi-thu')}
                    style={{ width: '100%', padding: '12px 16px', fontSize: '0.95rem', fontWeight: 700 }}
                  >
                    ⏱️ ĐĂNG NHẬP THI THỬ
                  </button>
                </div>
              </form>
            </div>


          </div>
        </main>
      )}

      {/* SCREEN 2: EXAM TABS DASHBOARD */}
      {screen === 'dashboard' && (
        <section className="screen active">
          <div className="dashboard-header">
            <div className="user-profile">
              <p>Chào mừng thí sinh</p>
              <h2>{name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                <span className="badge-mode" style={{ marginTop: 0 }}>
                  Chế độ: {mode === 'luyen-thi' ? 'Luyện thi' : 'Thi thử (60 phút)'}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm-switch"
                  onClick={() => setMode(mode === 'luyen-thi' ? 'thi-thu' : 'luyen-thi')}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: '1px solid rgba(255,255,255,0.3)',
                    color: '#ffffff',
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  🔄 Đổi sang {mode === 'luyen-thi' ? 'Thi thử' : 'Luyện thi'}
                </button>
              </div>
            </div>
            <div className="dashboard-meta">
              <div className="meta-item">
                <span className="meta-value">12</span>
                <span className="meta-label">Bộ Đề Thi</span>
              </div>
              <div className="meta-item">
                <span className="meta-value">40</span>
                <span className="meta-label">Câu/Đề</span>
              </div>
              <div className="meta-item">
                <span className="meta-value">35/40</span>
                <span className="meta-label">Điểm Đạt</span>
              </div>
            </div>
          </div>

          <div className="tabs-container">
            <div className="tabs-header">
              {Array.from({ length: 12 }).map((_, i) => {
                const examId = `de_${i + 1}`;
                return (
                  <button
                    key={examId}
                    type="button"
                    className={`tab-btn ${selectedExamId === examId ? 'active' : ''}`}
                    onClick={() => setSelectedExamId(examId)}
                  >
                    ĐỀ {i + 1}
                  </button>
                );
              })}
            </div>

            <div className="exam-detail-panel">
              <div className="exam-info">
                <h3>Đề thi số {selectedExamId.replace('de_', '')} - Chứng chỉ Cơ bản</h3>
                <p>40 câu hỏi trắc nghiệm</p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartExam}
              >
                Bắt đầu làm bài ngay
              </button>
            </div>
          </div>
        </section>
      )}

      {/* SCREEN 3: EXAM PLAYING ROOM */}
      {screen === 'exam' && currentExamQuestions.length > 0 && (
        <section className="screen active">
          {/* Top Bar with legends and countdown timer */}
          <div className="exam-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap', background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700 }}
                onClick={() => {
                  const confirmed = window.confirm("Bạn có chắc chắn muốn thoát khỏi bài làm? Mọi tiến trình sẽ bị hủy bỏ.");
                  if (confirmed) {
                    setScreen('dashboard');
                  }
                }}
              >
                &larr; Thoát
              </button>
              <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9rem', marginLeft: '8px' }}>Chú ý:</span>
              <span style={{ padding: '4px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b', borderRadius: '4px', fontSize: '0.8rem' }}>Chưa xem</span>
              <span style={{ padding: '4px 10px', background: '#008000', color: 'white', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Đã trả lời</span>
              <span style={{ padding: '4px 10px', background: '#ef4444', color: 'white', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Đã xem chưa trả lời</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span className="badge-mode-indicator" style={{
                fontWeight: 700,
                fontSize: '0.85rem',
                color: 'var(--primary-color)',
                background: 'var(--primary-light)',
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 102, 0, 0.2)'
              }}>
                Chế độ: {mode === 'luyen-thi' ? '📚 Luyện thi' : '⏱️ Thi thử'}
              </span>
              {mode === 'thi-thu' && (
                <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Thời gian còn lại:</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'red' }}>
                    {Math.floor(timeLeft / 3600)}:{String(Math.floor((timeLeft % 3600) / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="test-layout">
            <div className="quiz-main">
              <div className="quiz-card" style={{ border: '1px solid #a3b8cc', padding: '24px', background: 'white', borderRadius: '6px' }}>
                <div className="question-block" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#e65c00' }}>
                    Câu {String(currentQuestionIndex + 1).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: '1.1rem', color: '#000000', lineHeight: '1.6', fontWeight: 500 }}>
                    {currentExamQuestions[currentQuestionIndex].questionText}
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#e65c00', marginTop: '16px' }}>
                    Câu trả lời
                  </div>
                </div>

                <div
                  className="options-list"
                  style={{
                    marginTop: '12px',
                    pointerEvents: mode === 'luyen-thi' && userAnswers[currentQuestionIndex] !== undefined ? 'none' : 'auto'
                  }}
                >
                  {currentExamQuestions[currentQuestionIndex].options.map((opt, optIdx) => {
                    const prefix = String.fromCharCode(65 + optIdx);
                    let classNames = 'option-item';

                    const selectedIdx = userAnswers[currentQuestionIndex];
                    const isAnswered = selectedIdx !== undefined;

                    if (selectedIdx === optIdx) {
                      classNames += ' selected';
                    }

                    if (mode === 'luyen-thi' && isAnswered) {
                      const isCorrectOpt = optIdx === currentExamQuestions[currentQuestionIndex].correctAnswer;
                      const isUserChoice = selectedIdx === optIdx;

                      if (isCorrectOpt) {
                        classNames += ' correct';
                      } else if (isUserChoice) {
                        classNames += ' incorrect';
                      }
                    }

                    return (
                      <div
                        key={optIdx}
                        className={classNames}
                        onClick={() => handleSelectOption(currentQuestionIndex, optIdx)}
                      >
                        <input
                          type="radio"
                          checked={selectedIdx === optIdx}
                          readOnly
                          className={`radio-input-custom ${mode === 'luyen-thi' && isAnswered
                            ? optIdx === currentExamQuestions[currentQuestionIndex].correctAnswer
                              ? 'radio-correct'
                              : selectedIdx === optIdx
                                ? 'radio-incorrect'
                                : ''
                            : ''
                            }`}
                        />
                        <div className="option-text">
                          <strong>{prefix}/</strong> {opt}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="quiz-actions" style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={currentQuestionIndex === 0}
                    onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                    style={{ padding: '8px 20px', fontSize: '0.9rem' }}
                  >
                    &larr; Câu trước
                  </button>

                  {currentQuestionIndex < currentExamQuestions.length - 1 && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                      style={{ padding: '8px 20px', fontSize: '0.9rem' }}
                    >
                      Câu tiếp &rarr;
                    </button>
                  )}
                </div>
              </div>

              {/* Center-aligned 'Kết thúc bài thi' button */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn-ket-thuc"
                  onClick={() => handleSubmitExam(false)}
                >
                  Kết thúc bài thi
                </button>
              </div>
            </div>

            {/* SIDEBAR METRICS */}
            <div className="quiz-sidebar">
              <div className="sidebar-card" style={{ padding: '16px', background: 'white', border: '1px solid var(--border-color)' }}>
                <div className="sidebar-title">
                  <span>Bản Đồ Câu Hỏi</span>
                </div>

                <div className="question-grid">
                  {currentExamQuestions.map((_, idx) => (
                    <div
                      key={idx}
                      className={getGridItemClass(idx)}
                      onClick={() => setCurrentQuestionIndex(idx)}
                    >
                      Câu {String(idx + 1).padStart(2, '0')}
                    </div>
                  ))}
                </div>

                <div className="progress-bar-container" style={{ marginTop: '16px' }}>
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${(Object.keys(userAnswers).length / currentExamQuestions.length) * 100}%`
                    }}
                  />
                </div>
                <span className="progress-text" style={{ marginBottom: '8px' }}>
                  Đã làm: {Object.keys(userAnswers).length} / {currentExamQuestions.length} câu
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SCREEN 4: RESULTS */}
      {screen === 'result' && (
        <section className="screen active">
          <div className="results-card">
            <div className={`status-circle ${isPassed ? 'pass' : 'fail'}`}>
              {isPassed ? '🏆' : '❌'}
            </div>
            <h2 className={`result-status-title ${isPassed ? 'pass' : 'fail'}`}>
              {isPassed ? 'ĐẠT YÊU CẦU' : 'KHÔNG ĐẠT'}
            </h2>
            <div className="result-score-summary">
              {scoreCorrectCount}<span>/{currentExamQuestions.length}</span>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '10px' }}>
              (Điểm đạt yêu cầu từ 35 câu đúng trở lên)
            </p>

            <div className="result-detail-grid">
              <div className="result-detail-item">
                <span className="result-detail-val">{name}</span>
                <span className="result-detail-lbl">Học viên</span>
              </div>
              <div className="result-detail-item">
                <span className="result-detail-val">{mode === 'luyen-thi' ? 'Luyện tập' : 'Thi thử'}</span>
                <span className="result-detail-lbl">Chế độ</span>
              </div>
              <div className="result-detail-item" style={{ gridColumn: 'span 2', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '4px' }}>
                <span className="result-detail-val">
                  {Math.floor(timeSpent / 60)} phút {timeSpent % 60} giây
                </span>
                <span className="result-detail-lbl">Thời gian thực hiện</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '30px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartExam}
              >
                Làm lại đề này
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setScreen('dashboard')}
              >
                Về trang chủ
              </button>
            </div>

            {/* TTT Question Grid Overview (for Mock Exam) */}
            {mode === 'thi-thu' && (
              <div className="result-grid-section" style={{ marginBottom: '32px', textAlign: 'left', background: 'var(--bg-body)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 className="review-answers-title" style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '8px', marginBottom: '16px' }}>
                  Bản Đồ Kết Quả Bài Thi (TTT)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '8px', margin: '16px 0' }}>
                  {currentExamQuestions.map((q, idx) => {
                    const userChoiceIdx = userAnswers[idx];
                    const isCorrect = userChoiceIdx === q.correctAnswer;
                    let bgColor = '#cbd5e1'; // Gray (Unanswered)
                    let text = '#1e293b';
                    if (userChoiceIdx !== undefined) {
                      bgColor = isCorrect ? 'var(--success-color)' : 'var(--error-color)';
                      text = 'white';
                    }
                    return (
                      <div
                        key={idx}
                        style={{
                          aspectRatio: '1',
                          borderRadius: '8px',
                          background: bgColor,
                          color: text,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
                        }}
                      >
                        {idx + 1}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', justifyContent: 'center', marginTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: 'var(--success-color)', display: 'inline-block' }}></span>
                    <span style={{ fontWeight: 600 }}>Câu đúng</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: 'var(--error-color)', display: 'inline-block' }}></span>
                    <span style={{ fontWeight: 600 }}>Câu sai</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#cbd5e1', display: 'inline-block' }}></span>
                    <span style={{ fontWeight: 600 }}>Chưa trả lời</span>
                  </div>
                </div>
              </div>
            )}

            {/* TTT Styled Answer Sheet Table (for Mock Exam) */}
            {mode === 'thi-thu' && (
              <div className="result-table-section" style={{ marginBottom: '32px', textAlign: 'left', background: 'white', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <h3 className="review-answers-title" style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '8px', marginBottom: '16px' }}>
                  Bảng Đáp Án Chi Tiết (Mô phỏng TTT)
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="TTT-result-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ padding: '12px 10px', textAlign: 'center', border: '1px solid #e2e8f0', fontWeight: 700 }}>STT</th>
                        <th style={{ padding: '12px 10px', textAlign: 'left', border: '1px solid #e2e8f0', fontWeight: 700 }}>Nội dung câu hỏi</th>
                        <th style={{ padding: '12px 10px', textAlign: 'center', border: '1px solid #e2e8f0', fontWeight: 700, width: '100px' }}>Đáp án đã chọn</th>
                        <th style={{ padding: '12px 10px', textAlign: 'center', border: '1px solid #e2e8f0', fontWeight: 700, width: '100px' }}>Đáp án đúng</th>
                        <th style={{ padding: '12px 10px', textAlign: 'center', border: '1px solid #e2e8f0', fontWeight: 700, width: '120px' }}>Kết quả</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentExamQuestions.map((q, idx) => {
                        const userChoiceIdx = userAnswers[idx];
                        const isCorrect = userChoiceIdx === q.correctAnswer;
                        const userLetter = userChoiceIdx !== undefined ? String.fromCharCode(65 + userChoiceIdx) : '-';
                        const correctLetter = String.fromCharCode(65 + q.correctAnswer);

                        let statusText = 'Chưa làm';
                        let statusColor = '#64748b';
                        if (userChoiceIdx !== undefined) {
                          statusText = isCorrect ? 'Đúng' : 'Sai';
                          statusColor = isCorrect ? 'var(--success-color)' : 'var(--error-color)';
                        }

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', border: '1px solid #e2e8f0' }}>{idx + 1}</td>
                            <td style={{ padding: '10px', border: '1px solid #e2e8f0', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {q.questionText}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center', fontWeight: 800, color: userChoiceIdx !== undefined ? (isCorrect ? 'var(--success-color)' : 'var(--error-color)') : '#64748b', border: '1px solid #e2e8f0' }}>
                              {userLetter}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center', fontWeight: 800, color: 'var(--success-color)', border: '1px solid #e2e8f0' }}>
                              {correctLetter}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700, color: statusColor, border: '1px solid #e2e8f0' }}>
                              {statusText === 'Đúng' ? '✅ Đúng' : statusText === 'Sai' ? '❌ Sai' : '⚪ Chưa trả lời'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Detailed Question Review */}
            <div className="review-answers-section">
              <h3 className="review-answers-title">
                {mode === 'thi-thu' ? 'Chi Tiết Nội Dung Từng Câu Hỏi' : 'Chi Tiết Kết Quả Từng Câu Hỏi'}
              </h3>
              <div className="review-list">
                {currentExamQuestions.map((q, idx) => {
                  const userChoiceIdx = userAnswers[idx];
                  const isCorrect = userChoiceIdx === q.correctAnswer;

                  return (
                    <div
                      key={q.id}
                      className={`review-item ${isCorrect ? 'right' : 'wrong'}`}
                    >
                      <div className="review-q-text">Câu {idx + 1}: {q.questionText}</div>
                      {q.options.map((opt, optIdx) => {
                        const prefix = String.fromCharCode(65 + optIdx);
                        let classes = 'review-opt';

                        if (optIdx === q.correctAnswer) {
                          classes += ' correct-select';
                        } else if (optIdx === userChoiceIdx) {
                          classes += ' user-select';
                        }

                        return (
                          <div key={optIdx} className={classes}>
                            <strong>{prefix}.</strong> {opt}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CONFIRMATION POPUP MODAL */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon">⚠️</div>
            <h3 className="modal-title">Nộp Bài Thi</h3>
            <p className="modal-desc">
              {mode === 'luyen-thi'
                ? `Bạn đã làm ${Object.keys(userAnswers).length}/${currentExamQuestions.length} câu. Bạn có chắc chắn muốn hoàn thành bài luyện tập?`
                : `Bạn đã làm ${Object.keys(userAnswers).length}/${currentExamQuestions.length} câu. Bạn có chắc chắn muốn nộp bài thi ngay?`
              }
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowConfirmModal(false)}
              >
                Quay lại
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleSubmitExam(true)}
              >
                Xác nhận nộp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INSTRUCTIONS POPUP MODAL */}
      {showInstructionsModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '600px', textAlign: 'left' }}>
            <div className="modal-icon" style={{ textAlign: 'center', color: '#0284c7' }}>📋</div>
            <h3 className="modal-title" style={{ textAlign: 'center', color: 'var(--secondary-color)' }}>Hướng Dẫn Làm Bài Thi ĐLBH</h3>
            <div className="modal-desc" style={{ color: 'var(--text-main)', fontSize: '0.9rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px', lineHeight: '1.6' }}>
              <p style={{ marginBottom: '8px' }}><strong>1. Chọn tính năng:</strong></p>
              <ul style={{ marginLeft: '20px', marginBottom: '12px' }}>
                <li><strong>Luyện Thi:</strong> Phù hợp khi ôn tập tự luyện, không giới hạn thời gian làm bài. Chọn đáp án biết ngay kết quả đúng/sai để đọc và ghi nhớ ngay.</li>
                <li><strong>Thi Thử:</strong> Mô phỏng phòng thi thật với thời gian đếm ngược 60 phút, được đổi đáp án trong quá trình làm bài thi, tự động nộp bài khi hết giờ.</li>
              </ul>

              <p style={{ marginBottom: '8px' }}><strong>2. Quy chế đánh giá:</strong></p>
              <ul style={{ marginLeft: '20px', marginBottom: '12px' }}>
                <li>Mỗi đề thi gồm <strong>40 câu hỏi</strong> trắc nghiệm.</li>
                <li>Bạn cần trả lời đúng từ <strong>35/40 câu</strong> trở lên để được hệ thống đánh giá <strong>ĐẠT YÊU CẦU</strong>.</li>
              </ul>

              <p style={{ marginBottom: '8px' }}><strong>3. Các phím màu sắc trên Bản đồ câu hỏi (TTT):</strong></p>
              <ul style={{ marginLeft: '20px', marginBottom: '12px' }}>
                <li>Ô màu <strong>Xám nhạt:</strong> Câu hỏi chưa xem qua.</li>
                <li>Ô màu <strong>Đỏ:</strong> Câu hỏi đã xem nhưng chưa chọn đáp án trả lời.</li>
                <li>Ô màu <strong>Xanh lá cây:</strong> Câu hỏi đã làm/chọn đáp án.</li>
                <li>Ô có <strong>viền Cam nổi bật:</strong> Câu hỏi hiện tại bạn đang xem để làm bài.</li>
              </ul>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'center', marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowInstructionsModal(false)}
                style={{ background: '#0284c7', border: 'none', color: 'white' }}
              >
                Đóng hướng dẫn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer>
        <p>&copy; 2026 Hanwha Life Việt Nam. Phát triển cho công tác đào tạo Đại lý Bảo hiểm Nhân thọ Cơ bản.</p>
        <p>Hệ thống hỗ trợ chạy Offline. <a href="#" onClick={(e) => { e.preventDefault(); window.location.reload(); }}>Tải lại trang</a></p>
      </footer>
    </div>
  );
}
