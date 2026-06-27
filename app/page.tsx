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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
  function handleSubmitExam(force = false) {
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
  }

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
                <img src="/logo.png" alt="Hanwha Logo" style={{ height: '36px', objectFit: 'contain' }} />
              </div>
            </div>

            {/* Portal Titles */}
            <div style={{ marginTop: '30px' }}>
              <p className="vidi-portal-subtitle">
                Hệ thống ôn luyện thi chứng chỉ BHNT cơ bản
              </p>
              <h2 className="vidi-portal-title">
                BỘ PHẬN HUẤN LUYỆN - KÊNH ĐẠI LÝ
                <br />
                HANWHA LIFE VIỆT NAM
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
        <section className="screen active" style={{ maxWidth: '100%' }}>
          <div className={mode === 'luyen-thi' ? 'results-layout-single' : 'results-layout-container'}>
            {/* Left Column: Score Card */}
            <div className={`results-card ${mode === 'luyen-thi' ? '' : 'results-score-panel'}`}>
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

              {/* DYNAMIC FEEDBACK MESSAGE */}
              <div style={{
                margin: '20px auto 0',
                padding: '16px 20px',
                borderRadius: 'var(--radius-sm)',
                borderWidth: '1px',
                borderStyle: 'solid',
                fontSize: '1.05rem',
                fontWeight: '600',
                lineHeight: '1.5',
                maxWidth: '570px',
                textAlign: 'center',
                backgroundColor: scoreCorrectCount >= 35
                  ? 'var(--success-light)'
                  : scoreCorrectCount >= 30
                    ? '#fffbeb'
                    : 'var(--error-light)',
                borderColor: scoreCorrectCount >= 35
                  ? 'var(--success-color)'
                  : scoreCorrectCount >= 30
                    ? '#f59e0b'
                    : 'var(--error-color)',
                color: scoreCorrectCount >= 35
                  ? 'var(--success-color)'
                  : scoreCorrectCount >= 30
                    ? '#d97706'
                    : 'var(--error-color)',
              }}>
                {scoreCorrectCount >= 35 && "🏆 Chúc mừng bạn đã xuất sắc hoàn thành bài thi!!"}
                {scoreCorrectCount >= 30 && scoreCorrectCount < 35 && "⚡ Bạn chỉ cần cố gắng thêm chút nữa sẽ đạt!! Cố lên!"}
                {scoreCorrectCount < 30 && "📚 Bạn hãy dành nhiều thời gian ôn luyện để cải thiện kết quả"}
              </div>

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

              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '10px' }}>
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
            </div>

            {/* Right Column: Custom Option Grid Table */}
            {mode !== 'luyen-thi' && (
              <div className="results-grid-table-container">
              {/* Legend Badges */}
              <div className="results-grid-header">
                <span className="results-grid-legend-label">Chú ý:</span>
                <div className="results-grid-legend-badges">
                  <span className="results-grid-legend-badge unanswered">Chưa trả lời</span>
                  <span className="results-grid-legend-badge correct">Trả lời đúng</span>
                  <span className="results-grid-legend-badge incorrect">Trả lời sai</span>
                </div>
              </div>

              {/* Title */}
              <h2 className="results-grid-title">KẾT QUẢ THI</h2>

              {/* Table Block 1: Questions 1-20 */}
              <div className="results-table-block-wrapper">
                <table className="results-table-block">
                  <thead>
                    <tr>
                      <th className="header-corner-cell">Câu hỏi</th>
                      {Array.from({ length: 20 }).map((_, i) => (
                        <th key={i}>{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Rows A, B, C, D, E based on max options in Questions 1-20 */}
                    {Array.from({
                      length: Math.max(4, ...currentExamQuestions.slice(0, 20).map(q => q.options.length))
                    }).map((_, rIdx) => {
                      const letter = String.fromCharCode(65 + rIdx);
                      return (
                        <tr key={letter}>
                          <td className="row-label-cell">{letter}</td>
                          {Array.from({ length: 20 }).map((_, colIdx) => {
                            const qIdx = colIdx;
                            const question = currentExamQuestions[qIdx];
                            const userChoiceIdx = userAnswers[qIdx];

                            // Check if question exists and has this option index
                            const hasOption = question && rIdx < question.options.length;
                            const isSelected = hasOption && userChoiceIdx === rIdx;
                            const isCorrect = isSelected && userChoiceIdx === question.correctAnswer;

                            let cellClass = "cell-empty";
                            if (isSelected) {
                              cellClass = isCorrect ? "cell-correct" : "cell-incorrect";
                            }

                            return (
                              <td
                                key={colIdx}
                                className={`cell-option ${cellClass}`}
                              >
                                {isSelected ? letter : ""}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Block 2: Questions 21-40 */}
              <div className="results-table-block-wrapper">
                <table className="results-table-block">
                  <thead>
                    <tr>
                      <th className="header-corner-cell">Câu hỏi</th>
                      {Array.from({ length: 20 }).map((_, i) => (
                        <th key={i}>{i + 21}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Rows A, B, C, D, E based on max options in Questions 21-40 */}
                    {Array.from({
                      length: Math.max(4, ...currentExamQuestions.slice(20, 40).map(q => q.options.length))
                    }).map((_, rIdx) => {
                      const letter = String.fromCharCode(65 + rIdx);
                      return (
                        <tr key={letter}>
                          <td className="row-label-cell">{letter}</td>
                          {Array.from({ length: 20 }).map((_, colIdx) => {
                            const qIdx = colIdx + 20;
                            const question = currentExamQuestions[qIdx];
                            const userChoiceIdx = userAnswers[qIdx];

                            // Check if question exists and has this option index
                            const hasOption = question && rIdx < question.options.length;
                            const isSelected = hasOption && userChoiceIdx === rIdx;
                            const isCorrect = isSelected && userChoiceIdx === question.correctAnswer;

                            let cellClass = "cell-empty";
                            if (isSelected) {
                              cellClass = isCorrect ? "cell-correct" : "cell-incorrect";
                            }

                            return (
                              <td
                                key={colIdx}
                                className={`cell-option ${cellClass}`}
                              >
                                {isSelected ? letter : ""}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}
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

              <p style={{ marginBottom: '8px' }}><strong>3. Các phím màu sắc trên Bản đồ câu hỏi:</strong></p>
              <ul style={{ marginLeft: '20px', marginBottom: '12px' }}>
                <li>Ô màu <strong>Xám nhạt:</strong> Câu hỏi chưa xem qua.</li>
                <li>Ô màu <strong>Đỏ:</strong> Câu hỏi đã xem nhưng chưa chọn đáp án trả lời.</li>
                <li>Ô màu <strong>Xanh lá cây:</strong> Câu hỏi đã làm/chọn đáp án.</li>

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
        <p> Soạn nội dung AT Như Tình. <a href="#" onClick={(e) => { e.preventDefault(); window.location.reload(); }}>Tải lại trang</a></p>
      </footer>
    </div>
  );
}
