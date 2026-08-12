UPDATE `workspace_settings`
SET `webhook_secret` = NULL
WHERE `webhook_secret` IS NOT NULL
  AND (
    substr(`webhook_secret`, 1, 6) <> 'whsec_'
    OR length(substr(`webhook_secret`, 7)) % 4 <> 0
    OR ((length(substr(`webhook_secret`, 7)) / 4) * 3
      - (length(substr(`webhook_secret`, 7)) - length(rtrim(substr(`webhook_secret`, 7), '=')))) NOT BETWEEN 24 AND 64
    OR rtrim(substr(`webhook_secret`, 7), '=') GLOB '*[^A-Za-z0-9+/]*'
    OR length(substr(`webhook_secret`, 7)) - length(rtrim(substr(`webhook_secret`, 7), '=')) > 2
    OR instr(rtrim(substr(`webhook_secret`, 7), '='), '=') > 0
    OR (substr(`webhook_secret`, -2) = '==' AND instr('AQgw', substr(`webhook_secret`, -3, 1)) = 0)
    OR (substr(`webhook_secret`, -1) = '=' AND substr(`webhook_secret`, -2, 1) <> '='
      AND instr('AEIMQUYcgkosw048', substr(`webhook_secret`, -2, 1)) = 0)
  );
