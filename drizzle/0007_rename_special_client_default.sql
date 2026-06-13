UPDATE special_clients
SET is_active = false, updated_at = now()
WHERE name = '特殊客戶'
  AND EXISTS (SELECT 1 FROM special_clients WHERE name = '儲值客戶');

UPDATE special_clients
SET name = '儲值客戶', updated_at = now()
WHERE name = '特殊客戶'
  AND NOT EXISTS (SELECT 1 FROM special_clients WHERE name = '儲值客戶');
