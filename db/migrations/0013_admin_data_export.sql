-- A person's data as a JSON file is for SAZO administrators only (for example to answer a formal data
-- request). People themselves read their data on the website and save it as a PDF.
INSERT INTO iam.permissions (code, description) VALUES ('user.data.export', 'Download a person''s data as a JSON file')
  ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, 'user.data.export' FROM iam.roles r WHERE r.code = 'sazo_admin'
  ON CONFLICT DO NOTHING;
