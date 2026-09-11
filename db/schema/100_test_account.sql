-- 前端自己加的，後端沒有：一個可登入的測試帳號（規格 FE-O03-S09 的第三種模式需要它；後端的 seed 沒有任何 login_id）。
--
-- 把 seed 的第一張名片加上帳號密碼，**不新增名片** —— 分頁的筆數不變（FE-O04 S03 / FE-O03 S15）。
-- 密碼是 guild1234，雜湊格式與參數跟真後端 app/passwords.py 一樣（scrypt$salt$digest，n=2**14 r=8 p=1，64 bytes），
-- 所以這個檔案套到真後端的庫也登得進。雜湊由 node -e "…hashPassword('guild1234')" 產生。
update profiles
set login_id = 'seed-account', password_hash = 'scrypt$+jlH3Onpm6KXUE3AeVpUoQ==$bL3dq2tf4TQJqJtquXlRSHYZPZfIdA/PSADB32Xe/Ypmm2tS39yOPzq8FqdDgI3lm9IpFP/0fH3zqgFIOVaHeQ=='
where id = '11111111-0000-4000-8000-000000000001';
