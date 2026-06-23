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
  /cả\s+.*(đều|đúng|sai)/i,
  /tất\s+cả\s+(các)?\s+(phương\s+án|đáp\s+án|câu)/i,
  /phương\s+án\s+trên/i,
  /câu\s+trên\s+đều/i,
  /a\s+và\s+b/i,
  /b\s+và\s+c/i,
  /a\s+và\s+c/i,
  /không\s+câu\s+nào/i,
  /không\s+có\s+trường\s+hợp/i,
  /đều\s+đúng/i,
  /đều\s+sai/i
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
  
  // Timer states
  const [timeLeft, setTimeLeft] = useState(3600); // 60 minutes
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [timeSpent, setTimeSpent] = useState(0);
  
  // Modals & effects
  const [showConfirmModal, setShowConfirmModal] = useState(false);
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
    setTimeLeft(3600); // 60 minutes
    setStartTime(new Date());
    setScreen('exam');
  };

  // Select Option Handler
  const handleSelectOption = (qIdx: number, optIdx: number) => {
    // In practice mode, lock inputs after choosing once
    if (mode === 'luyen-thi' && isQuestionAnswered[qIdx]) return;

    setUserAnswers(prev => ({ ...prev, [qIdx]: optIdx }));
    setIsQuestionAnswered(prev => ({ ...prev, [qIdx]: true }));
  };

  // Render navigation grid status classes
  const getGridItemClass = (idx: number) => {
    let base = 'grid-item';
    if (currentQuestionIndex === idx) base += ' active';
    
    if (mode === 'luyen-thi') {
      if (isQuestionAnswered[idx]) {
        base += ' answered';
        const q = currentExamQuestions[idx];
        const isCorrect = userAnswers[idx] === q.correctAnswer;
        base += isCorrect ? ' correct' : ' incorrect';
      }
    } else {
      if (userAnswers[idx] !== undefined) {
        base += ' answered';
      }
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
    if (username === '111111111' && password === '111111111') {
      setName('Học viên Hanwha');
      setPhone('111111111');
      setCode('HW111111111');
      setMode(selectedMode);
      setScreen('dashboard');
    } else {
      alert('Tài khoản hoặc mật khẩu không chính xác! Vui lòng sử dụng tài khoản "111111111" và mật khẩu "111111111".');
    }
  };

  // Calculate score values
  const scoreCorrectCount = currentExamQuestions.reduce((acc, q, idx) => {
    return userAnswers[idx] === q.correctAnswer ? acc + 1 : acc;
  }, 0);

  const isPassed = scoreCorrectCount >= 35;

  return (
    <div className="app-container">
      {/* BRAND HEADER */}
      <header>
        <div className="logo-container">
          <svg className="logo-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="45" stroke="#ff6600" strokeWidth="6" strokeDasharray="180 50" />
            <path d="M35 50 C 35 38, 48 30, 60 38 C 72 46, 72 60, 60 68 C 48 76, 35 62, 35 50 Z" fill="#ff6600" />
            <circle cx="48" cy="50" r="12" fill="#ffffff" />
            <circle cx="60" cy="50" r="8" fill="#e65c00" opacity="0.8" />
          </svg>
          <div className="brand-info">
            <h1>Hanwha Life <span>E-Learning</span></h1>
            <p>Luyện Thi Chứng Chỉ Đại Lý Cơ Bản</p>
          </div>
        </div>
        {screen !== 'auth' && (
          <div className="user-badge">
            <span className="user-badge-name">{name}</span>
            <span className="user-badge-code">Mã: {code || 'CHƯA CÓ'}</span>
          </div>
        )}
      </header>

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

      {/* SCREEN 1: LOGIN / SELECT MODE */}
      {screen === 'auth' && (
        <main className="screen active">
          <div className="auth-card">
            <div className="auth-header">
              <h2>Đăng Nhập Hệ Thống</h2>
              <p>Vui lòng đăng nhập bằng tài khoản được cấp để tiếp tục</p>
            </div>
            
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="form-group">
                <label htmlFor="username-input">Tên đăng nhập <span style={{ color: 'var(--primary-color)' }}>*</span></label>
                <input
                  id="username-input"
                  type="text"
                  className="form-control"
                  placeholder="Nhập tên đăng nhập"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password-input">Mật khẩu <span style={{ color: 'var(--primary-color)' }}>*</span></label>
                <input
                  id="password-input"
                  type="password"
                  className="form-control"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              
              <p style={{ textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                (*) Đăng nhập bằng tài khoản và mật khẩu <strong>111111111</strong>.
              </p>

              <div className="auth-actions">
                <button
                  type="button"
                  className="btn btn-mode"
                  onClick={() => handleLoginAndMode('luyen-thi')}
                >
                  <i>📚</i>
                  <span className="mode-title">LUYỆN THI</span>
                  <span className="mode-desc">Xem đáp án ngay trên từng câu</span>
                </button>
                <button
                  type="button"
                  className="btn btn-mode"
                  onClick={() => handleLoginAndMode('thi-thu')}
                >
                  <i>⏱️</i>
                  <span className="mode-title">THI THỬ</span>
                  <span className="mode-desc">Thời gian 60 phút như thi thật</span>
                </button>
              </div>
            </form>
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
              <span className="badge-mode">
                Chế độ: {mode === 'luyen-thi' ? 'Luyện thi' : 'Thi thử (60 phút)'}
              </span>
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
          <div className="test-layout">
            <div className="quiz-main">
              <div className="quiz-card">
                <div className="quiz-meta">
                  CÂU HỎI {currentQuestionIndex + 1} / {currentExamQuestions.length}
                </div>
                
                <div className="question-text">
                  {currentExamQuestions[currentQuestionIndex].questionText}
                </div>
                
                <div className="options-list">
                  {currentExamQuestions[currentQuestionIndex].options.map((opt, optIdx) => {
                    const prefix = String.fromCharCode(65 + optIdx);
                    let classNames = 'option-item';
                    
                    const isAnswered = isQuestionAnswered[currentQuestionIndex];
                    const selectedIdx = userAnswers[currentQuestionIndex];
                    const correctIdx = currentExamQuestions[currentQuestionIndex].correctAnswer;

                    if (mode === 'luyen-thi') {
                      if (isAnswered) {
                        if (optIdx === correctIdx) {
                          classNames += ' correct';
                        } else if (optIdx === selectedIdx) {
                          classNames += ' incorrect';
                        }
                      }
                    } else {
                      if (selectedIdx === optIdx) {
                        classNames += ' selected';
                      }
                    }

                    return (
                      <div
                        key={optIdx}
                        className={classNames}
                        onClick={() => handleSelectOption(currentQuestionIndex, optIdx)}
                      >
                        <div className="option-prefix">{prefix}</div>
                        <div className="option-text">{opt}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation panel in Practice Mode */}
                {mode === 'luyen-thi' && isQuestionAnswered[currentQuestionIndex] && (
                  <div className="explanation-panel" style={{ display: 'block' }}>
                    <strong>Chính xác!</strong> Đáp án đúng là <strong>
                      {String.fromCharCode(65 + currentExamQuestions[currentQuestionIndex].correctAnswer)}
                    </strong>: "{currentExamQuestions[currentQuestionIndex].options[currentExamQuestions[currentQuestionIndex].correctAnswer]}"
                  </div>
                )}
                
                <div className="quiz-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={currentQuestionIndex === 0}
                    onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                  >
                    &larr; Câu trước
                  </button>

                  {/* Mode-specific progression logic */}
                  {mode === 'luyen-thi' ? (
                    // In practice mode: Show Next Question only after choosing an option
                    isQuestionAnswered[currentQuestionIndex] && currentQuestionIndex < currentExamQuestions.length - 1 && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                      >
                        Câu tiếp &rarr;
                      </button>
                    )
                  ) : (
                    // In Mock exam mode: Advance freely
                    currentQuestionIndex < currentExamQuestions.length - 1 && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                      >
                        Câu tiếp &rarr;
                      </button>
                    )
                  )}
                  
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => handleSubmitExam(false)}
                  >
                    HOÀN THÀNH
                  </button>
                </div>
              </div>
            </div>
            
            {/* SIDEBAR METRICS */}
            <div className="quiz-sidebar">
              {mode === 'thi-thu' && (
                <div className={`sidebar-card timer-container ${timeLeft < 300 ? 'timer-warning' : ''}`}>
                  <div className="timer-icon">⏱️</div>
                  <div className="timer-value">
                    {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:
                    {String(timeLeft % 60).padStart(2, '0')}
                  </div>
                </div>
              )}
              
              <div className="sidebar-card">
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
                      {idx + 1}
                    </div>
                  ))}
                </div>
                
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${(Object.keys(userAnswers).length / currentExamQuestions.length) * 100}%`
                    }}
                  />
                </div>
                <span className="progress-text">
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
                <span className="result-detail-val">{phone}</span>
                <span className="result-detail-lbl">Số điện thoại</span>
              </div>
              <div className="result-detail-item">
                <span className="result-detail-val">{mode === 'luyen-thi' ? 'Luyện tập' : 'Thi thử'}</span>
                <span className="result-detail-lbl">Chế độ</span>
              </div>
              <div className="result-detail-item" style={{ gridColumn: 'span 3', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '4px' }}>
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
            
            {/* Detailed Question Review */}
            <div className="review-answers-section">
              <h3 className="review-answers-title">Chi Tiết Kết Quả Từng Câu Hỏi</h3>
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

      {/* FOOTER */}
      <footer>
        <p>&copy; 2026 Hanwha Life Việt Nam. Phát triển cho công tác đào tạo Đại lý Bảo hiểm Nhân thọ Cơ bản.</p>
        <p>Hệ thống hỗ trợ chạy Offline. <a href="#" onClick={(e) => { e.preventDefault(); window.location.reload(); }}>Tải lại trang</a></p>
      </footer>
    </div>
  );
}
