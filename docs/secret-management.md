# Secret Management

## 1. Nguyên tắc

- Config không chứa plain token/password.
- Config chỉ chứa `secret_ref`.
- Secret value chỉ tồn tại trong runtime memory của server.
- Secret không được log, không được return, không được đưa vào prompt/context.
- Provider chỉ nhận secret khi cần thực thi call.

## 2. Secret reference format

```text
env:NAME
file-encrypted:path#key
docker-secret:name
k8s:namespace/name#key
aws-sm:region/secret-name#json-key
gcp-sm:project/secret/versions/latest
vault:path#key
onepassword:vault/item/field
doppler:project/config/secret
```

MVP chỉ cần implement `env:`. Các nguồn khác implement dần qua `SecretSource` interface.

## 3. Config đúng/sai

Sai:

```yaml
github:
  token: ghp_xxxxx
```

Đúng:

```yaml
github:
  auth:
    type: token
    token_ref: env:GITHUB_TOKEN
```

Sai:

```yaml
postgres:
  url: postgres://user:password@localhost:5432/app
```

Đúng:

```yaml
postgres:
  connections:
    main:
      host: localhost
      port: 5432
      database: app
      username_ref: env:POSTGRES_USER
      password_ref: env:POSTGRES_PASSWORD
```

## 4. Runtime resolution

Secret Resolver nhận `SecretRef`, trả về `ResolvedSecret` trong memory:

```ts
const password = await secretResolver.resolve('env:POSTGRES_PASSWORD');
```

`ResolvedSecret` không có `toJSON()` để tránh accidental serialization.

## 5. Logging rules

- Log `secret_ref`, không log value.
- Error phải normalize trước khi log.
- Structured logger phải chạy redactor trên mọi payload.
- Debug logs vẫn redact.

## 6. Admin config display

Nếu cần hiển thị config cho admin:

```json
{
  "token_ref": "env:GITHUB_TOKEN",
  "token_preview": "ghp_****abcd"
}
```

Không bao giờ hiển thị full token.

## 7. Provider responsibility

Provider không được:

- expose secret qua tool/resource/prompt
- include secret trong exception
- log secret
- build connection string rồi return/log
- tạo tool inspect environment/config

Provider phải:

- nhận secret qua runtime only
- redact error từ client library
- đóng connection đúng cách
- support least privilege token/scope
