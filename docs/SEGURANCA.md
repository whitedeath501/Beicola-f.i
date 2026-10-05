# Segurança

- Senhas armazenadas com bcrypt.
- Sessões em cookies HTTP-only e SameSite.
- Token de recuperação aleatório, armazenado somente como hash e com expiração de 15 minutos.
- Sessões encerradas após troca/redefinição de senha.
- Helmet e rate limit.
- Consultas SQLite parametrizadas.
- Não coloque credenciais SMTP no GitHub.
- Para publicação real, use HTTPS, política de privacidade, backups, logs/auditoria e revisão de segurança.
