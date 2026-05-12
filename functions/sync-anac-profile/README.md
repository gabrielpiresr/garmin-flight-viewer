# Sync ANAC Profile Function

This Appwrite Function imports pilot data from ANAC and updates the student's profile document.

## Required Function Environment Variables

- `APPWRITE_FUNCTION_API_ENDPOINT`
- `APPWRITE_FUNCTION_PROJECT_ID`
- `APPWRITE_API_KEY`
- `APPWRITE_DATABASE_ID`
- `APPWRITE_PROFILES_COLLECTION_ID`
- `APPWRITE_BUCKET_ID`

## Request Body

```json
{
  "cpf": "06254435608",
  "anacCode": "264933",
  "birthDate": "1990-05-10"
}
```

## Behavior

- Calls `https://consultadelicencas.anac.gov.br/consultadelicencas/` with `POST`.
- Parses and stores:
  - Habilitacoes + validade
  - Licencas + data de expedicao
  - Certificado Medico Aeronautico (classe, validade, orgao, observacoes)
  - Pilot photo (saved to Appwrite Storage)
- On parser/network failure, keeps onboarding alive and marks profile as `anac_sync_status = pending`.
