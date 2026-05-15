CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  nickname VARCHAR(32) NOT NULL,
  avatar_url VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_messages_created_at (created_at),
  KEY idx_messages_user_created_at (user_id, created_at),
  CONSTRAINT fk_messages_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS daily_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  question TEXT NOT NULL,
  options JSON NOT NULL,
  source_type ENUM('online', 'fallback', 'manual') NOT NULL DEFAULT 'online',
  source_context TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_daily_questions_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS daily_answers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  answer_index INT NOT NULL,
  answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_daily_answer_once (question_id, user_id),
  KEY idx_daily_answers_question_id (question_id),
  CONSTRAINT fk_daily_answers_question
    FOREIGN KEY (question_id) REFERENCES daily_questions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_daily_answers_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gomoku_games (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  status ENUM('invited', 'playing', 'finished', 'declined') NOT NULL DEFAULT 'invited',
  invited_by VARCHAR(36) NOT NULL,
  player_black VARCHAR(36) NOT NULL,
  player_white VARCHAR(36) NOT NULL,
  current_turn VARCHAR(36) NULL,
  winner VARCHAR(36) NULL,
  board_state JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_gomoku_status_updated (status, updated_at),
  KEY idx_gomoku_player_black (player_black),
  KEY idx_gomoku_player_white (player_white),
  CONSTRAINT fk_gomoku_invited_by
    FOREIGN KEY (invited_by) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_gomoku_player_black
    FOREIGN KEY (player_black) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_gomoku_player_white
    FOREIGN KEY (player_white) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gomoku_moves (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  game_id BIGINT NOT NULL,
  move_no INT NOT NULL,
  player_id VARCHAR(36) NOT NULL,
  row_idx INT NOT NULL,
  col_idx INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gomoku_move_no (game_id, move_no),
  UNIQUE KEY uq_gomoku_cell_once (game_id, row_idx, col_idx),
  CONSTRAINT fk_gomoku_moves_game
    FOREIGN KEY (game_id) REFERENCES gomoku_games(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_gomoku_moves_user
    FOREIGN KEY (player_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
