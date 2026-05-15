import type { DailyQuestionStats, DailyQuestionTodayResponse } from "@xiaoelong/shared";

interface DailyQuestionPanelProps {
  data: DailyQuestionTodayResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onAnswer: (answerIndex: number) => Promise<void>;
}

function getPercent(count: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((count / total) * 100);
}

function renderStats(stats: DailyQuestionStats, options: string[], answeredIndex: number | null): JSX.Element {
  return (
    <div className="question-stats">
      {options.map((option, index) => {
        const count = stats.counts[index] ?? 0;
        const percent = getPercent(count, stats.totalAnswers);
        return (
          <div key={index} className={`question-stat-item ${answeredIndex === index ? "mine" : ""}`}>
            <div className="question-stat-top">
              <span>{option}</span>
              <strong>
                {count} 票 ({percent}%)
              </strong>
            </div>
            <div className="question-stat-bar">
              <div style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DailyQuestionPanel(props: DailyQuestionPanelProps): JSX.Element {
  if (props.loading) {
    return (
      <section className="module-card">
        <h2>每日问题</h2>
        <p>加载题目中...</p>
      </section>
    );
  }

  if (!props.data) {
    return (
      <section className="module-card">
        <h2>每日问题</h2>
        <p>{props.error || "暂时没有可用题目。"}</p>
        <button type="button" onClick={() => void props.onRefresh()}>
          重试
        </button>
      </section>
    );
  }

  const { question, stats, answeredIndex } = props.data;
  const answered = answeredIndex !== null;

  return (
    <section className="module-card">
      <div className="module-head">
        <h2>每日问题</h2>
        <button type="button" onClick={() => void props.onRefresh()}>
          刷新
        </button>
      </div>

      <p className="question-date">{question.date}</p>
      <h3 className="question-title">{question.question}</h3>

      {!answered ? (
        <div className="question-options">
          {question.options.map((option, index) => (
            <button key={index} type="button" onClick={() => void props.onAnswer(index)}>
              {option}
            </button>
          ))}
        </div>
      ) : (
        <p className="question-note">你今天已作答，下面是实时统计。</p>
      )}

      {props.error ? <p className="error-text">{props.error}</p> : null}
      {renderStats(stats, question.options, answeredIndex)}
    </section>
  );
}
