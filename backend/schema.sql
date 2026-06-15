CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_username_unique (username)
);

CREATE TABLE products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  price_points INT UNSIGNED NOT NULL,
  minecraft_command VARCHAR(512) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY products_sku_unique (sku)
);

CREATE TABLE wallet_accounts (
  user_id BIGINT UNSIGNED NOT NULL,
  balance_points BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT wallet_accounts_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE wallet_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('credit', 'debit') NOT NULL,
  amount_points BIGINT UNSIGNED NOT NULL,
  balance_after BIGINT NOT NULL,
  reference_type VARCHAR(40) NOT NULL,
  reference_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY wallet_transactions_user_idx (user_id),
  CONSTRAINT wallet_transactions_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending_delivery', 'delivered', 'delivery_failed') NOT NULL DEFAULT 'pending_delivery',
  total_points BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY orders_user_idx (user_id),
  CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price_points INT UNSIGNED NOT NULL,
  minecraft_command VARCHAR(512) NOT NULL,
  PRIMARY KEY (id),
  KEY order_items_order_idx (order_id),
  CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT order_items_product_fk FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE TABLE delivery_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  status ENUM('queued', 'processing', 'succeeded', 'failed') NOT NULL DEFAULT 'queued',
  command_payload VARCHAR(512) NOT NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMP NULL,
  lease_expires_at TIMESTAMP NULL,
  last_error TEXT NULL,
  bridge_message_id VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY delivery_jobs_order_idx (order_id),
  KEY delivery_jobs_status_idx (status),
  UNIQUE KEY delivery_jobs_bridge_message_unique (bridge_message_id),
  CONSTRAINT delivery_jobs_order_fk FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT delivery_jobs_order_item_fk FOREIGN KEY (order_item_id) REFERENCES order_items (id)
);

CREATE TABLE topup_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  amount_minor BIGINT UNSIGNED NOT NULL,
  points BIGINT UNSIGNED NOT NULL,
  provider_reference VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY topup_requests_user_idx (user_id),
  CONSTRAINT topup_requests_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
);
