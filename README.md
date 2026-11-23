# FinançasPro

Site estático (HTML + CSS + JS, sem build) que usa o **Supabase** como banco de dados e login,
pronto para hospedar na **Vercel**.

## 1. Banco de dados (Supabase)
1. Crie um projeto em supabase.com.
2. **SQL Editor > New query**: cole o arquivo `financaspro-supabase.sql` (entregue separado do site) e clique em **Run**.
3. **Authentication > URL Configuration**: coloque o endereço do seu site da Vercel em *Site URL* e em *Redirect URLs*
   (sem isso, os links de confirmar e-mail e recuperar senha não voltam para o site).
4. **Project Settings > API**: copie *Project URL* e a chave *anon public*.

## 2. Configurar o site
Abra `js/supabase-config.js` e troque as duas linhas:

```js
window.FP_SUPABASE = {
  url: 'https://SEU-PROJETO.supabase.co',
  anonKey: 'COLE_AQUI_A_CHAVE_ANON_PUBLIC'
};
```
A chave `anon` é pública por natureza (quem protege os dados são as regras RLS do banco).
**Nunca** use a chave `service_role` aqui.

## 3. Publicar na Vercel
- Suba esta pasta para um repositório no GitHub e importe em vercel.com/new
  (ou arraste a pasta em *Add New > Project* usando a Vercel CLI: `vercel --prod`).
- *Framework Preset*: **Other**. *Build Command*: vazio. *Output Directory*: vazio (raiz).
- O arquivo `vercel.json` já inclui cabeçalhos de segurança e cache dos arquivos de `assets/`.

## 4. Rodar no seu computador
`python3 -m http.server 3000` dentro desta pasta e abra http://localhost:3000
(para o login por e-mail funcionar localmente, adicione `http://localhost:3000` em *Redirect URLs* do Supabase).

## E-mails do Supabase (confirmação e recuperar senha)
O envio padrão do Supabase é limitado a poucos e-mails por hora. Para uso real, configure um SMTP próprio
em *Authentication > Emails > SMTP Settings*.

## Arquivos
| Arquivo | Função |
|---|---|
| `index.html` | Todas as telas (login, cadastro, recuperar senha, nova senha, app e configurações) |
| `css/app.css` | Estilo do app (topo em pílulas no PC, barra inferior no celular) |
| `css/auth.css` | Telas de acesso — **sempre no tema claro** |
| `css/config.css` | Painel de Configurações |
| `js/supabase-config.js` | URL e chave do seu projeto Supabase |
| `js/vendor/supabase.js` | Biblioteca oficial `@supabase/supabase-js` v2.45.4 (cópia local) |
| `js/api.js` | **Único arquivo que conversa com o banco** (`Auth` = conta, `Data` = dados) |
| `js/auth.js` | Login, cadastro, recuperar senha, nova senha |
| `js/app.js` | Lógica do app financeiro e avisos de vencimento |
| `js/config.js` | Configurações e perfil no topo |
