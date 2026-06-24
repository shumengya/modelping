-- 是否在首页展示该监控卡片（1=展示，0=仅后台管理可见，仍参与探测）

ALTER TABLE monitors ADD COLUMN show_on_dashboard INTEGER NOT NULL DEFAULT 1 CHECK (show_on_dashboard IN (0, 1));
