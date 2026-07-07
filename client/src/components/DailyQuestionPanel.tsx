import type {
  DailyQuestionResult,
  DailyQuestionStats,
  DailyQuestionTodayResponse,
  DailyQuestionVoter
} from "@xiaoelong/shared";
import { UserAvatar } from "./UserAvatar";

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

function getChoiceLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

function VoterChip(props: { voter: DailyQuestionVoter }): JSX.Element {
  const { voter } = props;
  return (
    <span className="question-voter" title={voter.nickname}>
      <UserAvatar user={voter} className="" fallbackClassName="question-voter-fallback" />
      <span>{voter.nickname}</span>
    </span>
  );
}

function ResultSummary(props: { result: DailyQuestionResult; options: string[] }): JSX.Element {
  const correctOption = props.options[props.result.correctAnswerIndex] ?? "";
  return (
    <div className={`question-result ${props.result.isCorrect ? "correct" : "wrong"}`}>
      <strong>{props.result.isCorrect ? "答对了" : "答错了"}</strong>
      <span>
        正确答案：{getChoiceLabel(props.result.correctAnswerIndex)}. {correctOption}
      </span>
      <p>{props.result.explanation}</p>
    </div>
  );
}

function renderStats(
  stats: DailyQuestionStats,
  options: string[],
  answeredIndex: number | null,
  correctAnswerIndex: number | null
): JSX.Element {
  return (
    <div className="question-stats">
      {options.map((option, index) => {
        const count = stats.counts[index] ?? 0;
        const percent = getPercent(count, stats.totalAnswers);
        const voters = stats.voters[index] ?? [];
        const isMine = answeredIndex === index;
        const isCorrect = correctAnswerIndex === index;
        return (
          <div
            key={index}
            className={`question-stat-item ${isMine ? "mine" : ""} ${isCorrect ? "correct" : ""}`}
          >
            <div className="question-stat-top">
              <div>
                <span className="question-choice-index">{getChoiceLabel(index)}</span>
                <span>{option}</span>
              </div>
              <strong>
                {count} 票 · {percent}%
              </strong>
            </div>
            <div className="question-stat-bar" aria-hidden="true">
              <div style={{ width: `${percent}%` }} />
            </div>
            <div className="question-voters">
              {voters.length > 0 ? voters.map((voter) => <VoterChip key={voter.id} voter={voter} />) : <span>还没有人选择</span>}
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
      <section className="module-card daily-card">
        <h2>每日一题</h2>
        <p className="muted-text">正在加载题目...</p>
      </section>
    );
  }

  if (!props.data) {
    return (
      <section className="module-card daily-card">
        <h2>每日一题</h2>
        <p className="muted-text">{props.error || "暂时没有可用题目。"}</p>
        <button type="button" className="ghost-button" onClick={() => void props.onRefresh()}>
          重试
        </button>
      </section>
    );
  }

  const { question, stats, answeredIndex, result } = props.data;
  const answered = answeredIndex !== null;

  return (
    <section className="module-card daily-card">
      <div className="module-head daily-head">
        <div className="daily-title-row">
          <h2>每日一题</h2>
          <span className="question-category">{question.category}</span>
          <span className="question-date">{question.date}</span>
        </div>
        <button type="button" className="ghost-button" onClick={() => void props.onRefresh()}>
          刷新
        </button>
      </div>

      <div className="daily-content">
        <h3 className="question-title">{question.question}</h3>

        {!answered ? (
          <div className="question-options">
            {question.options.map((option, index) => (
              <button key={index} type="button" onClick={() => void props.onAnswer(index)}>
                <span>{getChoiceLabel(index)}</span>
                {option}
              </button>
            ))}
          </div>
        ) : (
          <>
            {result ? <ResultSummary result={result} options={question.options} /> : null}
            <p className="question-note">下面是大家的实时选择。</p>
            {renderStats(stats, question.options, answeredIndex, result?.correctAnswerIndex ?? null)}
          </>
        )}

        {props.error ? <p className="error-text">{props.error}</p> : null}
      </div>
    </section>
  );
}
