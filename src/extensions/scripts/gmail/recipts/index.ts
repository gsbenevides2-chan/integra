import { google } from "googleapis";
import { getClient } from "utils/google/authService";
import { s3 } from "bun";
import OpenAI from "openai";
import { getOpenAIInstrumentableFetchClient } from "core/instrumentation";
import { zodTextFormat } from "openai/helpers/zod.mjs";
import z from "zod";
import { sendSSHCommand } from "utils/ssh/sendCommand";
import sendDiscordMessage from "utils/discord/sendMessage";
import onCron from "core/triggers/cron";

const AI_SYSTEM_PROMPT = `Você vai verificar se esse arquivo enviado corresponde a alguma regra a seguir: 
### Recibo de Salário
Quando o documento é um recibo de salario/ holerite de trabalho
type = payslip
date = extrair o mes e o ano do recibo de salario sendo o mes sempre em dois digitos e ano em quatro e no final formatado {mes}/{ano} ex: 09/2010

## Recibo de Pagamento de Decimo Terceiro
Quando o documento é um recibo especificamente do 13 salario
type = payslip13
date = extrair o mes e o ano do recibo de salario sendo o mes sempre em dois digitos e ano em quatro e no final formatado {mes}/{ano} ex: 09/2010
parcel = 1 ou 2 olhar no assunto do email fica dizendo sé a primeira ou segunda.

## Informes de Rendimento a Receita
Quando o documento é um Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte
type = arduana
date = Ano-Calendário não confundir com o Exercicio normalmente o Ano-Calendário é anterior ao exercicio

### Sem classificação
Quando o documento em anexo não possui classificação.
type = none`;

const zodFormat = z.object({
    response: z.union([
        z.object({
            type: z.literal("payslip"),
            date: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/),
        }),
        z.object({
            type: z.literal("payslip13"),
            date: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/),
            parcel: z.number().min(1).max(2),
        }),
        z.object({
            type: z.literal("arduana"),
            date: z.string().regex(/\d{4}$/),
        }),
        z.object({
            type: z.literal("none"),
        }),
    ]),
});

export const gmailProcessRecipts = onCron(
    {
        cron: "0 12 * * *",
        id: "gmail:recipts",
    },
    async (_, traceId) => {
        const openai = new OpenAI({
            apiKey: process.env.OPEN_ROUTER_API_KEY!,
            baseURL: "https://openrouter.ai/api/v1",
            fetch: getOpenAIInstrumentableFetchClient(traceId),
        });
        const { authClient } = await getClient("guilherme.benevides@econverse.com.br", traceId);
        const gmail = google.gmail({ version: "v1", auth: authClient });
        const listResponse = await gmail.users.messages.list({
            auth: authClient,
            userId: "me",
            q: "from:(noreply@teampartner.com.br | ana.nascimento@econverse.com.br | gustavo.cipriano@econverse.com.br) has:attachment is:unread -label:documento-salvo",
        });
        const labelsRespponse = await gmail.users.labels.list({
            auth: authClient,
            userId: "me",
        });
        const documentSaveLabelId = labelsRespponse.data.labels?.find(
            (l) => l.name === "documento-salvo",
        )?.id;
        if (!documentSaveLabelId) return;
        const emails = listResponse.data.messages ?? [];
        for (const email of emails) {
            const emailId = email.id;
            if (!emailId) continue;
            const completeEmailGetResponse = await gmail.users.messages.get({
                auth: authClient,
                userId: "me",
                id: emailId,
            });

            const emailData = completeEmailGetResponse.data;
            const emailSubject =
                emailData.payload?.headers?.find((h) => h.name?.toLowerCase() === "subject")
                    ?.value ?? "Sem Assunto";
            const parts = emailData.payload?.parts ?? [];
            const attachmentsIds = parts
                .filter((part) => part.mimeType === "application/pdf")
                .map((part) => part.body?.attachmentId)
                .filter((i) => i);
            for (const attachmentId of attachmentsIds) {
                if (!attachmentId) continue;
                const internalId = crypto.randomUUID();
                const attachmentResponse = await gmail.users.messages.attachments.get({
                    auth: authClient,
                    userId: "me",
                    messageId: emailId,
                    id: attachmentId,
                });
                const fileData = attachmentResponse.data.data;
                if (!fileData) continue;
                const attachmentFile = s3.file(`${internalId}.pdf`);
                await attachmentFile.write(Buffer.from(fileData, "base64url"), {
                    type: "application/pdf",
                });
                const presignedUrl = attachmentFile.presign({
                    expiresIn: 3600,
                });
                const { output_parsed } = await openai.responses.parse({
                    model: "openrouter/auto",
                    input: [
                        {
                            role: "system",
                            content: AI_SYSTEM_PROMPT,
                        },
                        {
                            role: "user",
                            content: [
                                {
                                    type: "input_text",
                                    text: `Assunto do Email: ${emailSubject}`,
                                },
                                {
                                    type: "input_file",
                                    file_url: presignedUrl,
                                },
                            ],
                        },
                    ],
                    text: {
                        format: zodTextFormat(zodFormat, "json"),
                    },
                });
                const type = output_parsed?.response.type;
                if (type === "payslip") {
                    const date = output_parsed?.response.date;
                    if (!date) continue;
                    const [month, year] = date.split("/");
                    const formatedDate = `${year}-${month}`;
                    const filePath = `/mnt/disco1/Documentos Organizados/Burrocracia/Documentos do Guilherme/Econverse/Recibos de Salário/${formatedDate}.PDF`;
                    const command = `wget -O '${filePath}' '${presignedUrl}'`;
                    await sendSSHCommand(command, traceId);
                    const message = `Arquivo salvo no servidor: ${filePath}`;
                    await sendDiscordMessage(message, traceId);
                }
                if (type === "payslip13") {
                    const date = output_parsed?.response.date;
                    const parcel = output_parsed?.response.parcel;
                    if (!date || !parcel) continue;
                    const [month, year] = date.split("/");
                    const formatedDate = `${year}-${month}`;
                    const filePath = `/mnt/disco1/Documentos Organizados/Burrocracia/Documentos do Guilherme/Econverse/Recibos de Salário/${formatedDate}-${parcel}-13.PDF`;
                    const command = `wget -O '${filePath}' '${presignedUrl}'`;
                    await sendSSHCommand(command, traceId);
                    const message = `Arquivo salvo no servidor: ${filePath}`;
                    await sendDiscordMessage(message, traceId);
                }
                if (type === "arduana") {
                    const date = output_parsed?.response.date;
                    if (!date) continue;
                    const filePath = `/mnt/disco1/Documentos Organizados/Burrocracia/Documentos do Guilherme/Econverse/Informes de Redimentos/Informe ${date}.pdf`;
                    const command = `wget -O '${filePath}' '${presignedUrl}'`;
                    await sendSSHCommand(command, traceId);
                    const message = `Arquivo salvo no servidor: ${filePath}`;
                    await sendDiscordMessage(message, traceId);
                }
                await attachmentFile.delete();
            }
            await gmail.users.messages.modify({
                auth: authClient,
                id: emailId,
                userId: "me",
                requestBody: {
                    addLabelIds: [documentSaveLabelId],
                },
            });
        }
    },
);
