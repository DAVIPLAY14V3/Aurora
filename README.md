# Aurora+ — carteira demonstrativa entre usuários

Este projeto é uma **simulação de carteira fechada**. Usuários podem criar contas, entrar e transferir créditos fictícios entre si. Não movimenta reais, não faz PIX bancário, não aceita depósitos/saques e não está conectado a bancos.

## Requisitos
- Node.js 20 ou superior
- npm

## Executar no computador
1. Extraia o ZIP.
2. Abra o terminal dentro da pasta `aurora_plus`.
3. Execute `npm install`.
4. Defina uma chave JWT própria antes de usar fora do computador:
   - macOS/Linux: `export JWT_SECRET="uma-chave-longa-e-aleatoria"`
   - Windows PowerShell: `$env:JWT_SECRET="uma-chave-longa-e-aleatoria"`
5. Execute `npm start`.
6. Abra `http://localhost:3000`.

O banco SQLite (`aurora.db`) será criado automaticamente. Cada conta nova recebe 1.000,00 créditos virtuais para teste.

## Testar transferências
1. Crie uma conta com um e-mail de teste.
2. Abra uma janela anônima ou outro navegador e crie uma segunda conta com outro e-mail.
3. Copie o e-mail da segunda conta na tela "Receber".
4. Na primeira conta, entre em "Enviar", informe o e-mail da segunda e um valor.
5. Confira os saldos e o extrato nas duas contas.

## Importante antes de publicar
Este é um protótipo educacional, não um sistema financeiro de produção. Para internet pública, será necessário HTTPS, segredo JWT forte e estável, rate limiting, validação adicional, logs e monitoramento, proteção contra abuso, backups, política de privacidade e revisão profissional de segurança. Não use dados ou senhas bancárias reais. Não anuncie os créditos como dinheiro resgatável.
