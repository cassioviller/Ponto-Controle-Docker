import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "@workspace/db";
import {
  funcionariosTable,
  funcionarioArquivosTable,
  insertFuncionarioSchema,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  GetFuncionariosQueryParams,
  GetFuncionarioParams,
  UpdateFuncionarioParams,
  UpdateFuncionarioBody,
  DeleteFuncionarioParams,
  CreateFuncionarioBody,
} from "@workspace/api-zod";

const router = Router();

const UPLOADS_ROOT = path.resolve(
  process.env["UPLOADS_DIR"] ?? path.join(process.cwd(), "uploads"),
);

function ensureUploadsDir(funcionarioId: number): string {
  const dir = path.join(UPLOADS_ROOT, "funcionarios", String(funcionarioId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        const id = Number(req.params["id"]);
        if (!Number.isFinite(id) || id <= 0) {
          cb(new Error("ID inválido"), "");
          return;
        }
        cb(null, ensureUploadsDir(id));
      } catch (err) {
        cb(err as Error, "");
      }
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
      const stamp = Date.now();
      cb(null, `${stamp}_${safe}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
    }
  },
});

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.get("/funcionarios", async (req, res) => {
  try {
    const query = GetFuncionariosQueryParams.parse(req.query);
    const empresaId = req.empresaId;

    let rows = await db.select().from(funcionariosTable);

    if (empresaId) {
      rows = rows.filter((r) => r.empresa_id === empresaId);
    }

    if (query.situacao) {
      rows = rows.filter((r) => r.situacao === query.situacao);
    }
    if (query.vinculo) {
      rows = rows.filter((r) => r.vinculo === query.vinculo);
    }
    if (query.ativo !== undefined) {
      rows = rows.filter((r) => r.ativo === query.ativo);
    }

    res.json(rows);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.post("/funcionarios", async (req, res) => {
  try {
    const body = CreateFuncionarioBody.parse(req.body);
    const empresaId = req.empresaId ?? req.body.empresa_id ?? null;
    const data = insertFuncionarioSchema.parse({ ...body, empresa_id: empresaId });
    const [row] = await db
      .insert(funcionariosTable)
      .values(data)
      .returning();
    res.status(201).json(row);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.get("/funcionarios/:id", async (req, res) => {
  try {
    const { id } = GetFuncionarioParams.parse({ id: Number(req.params.id) });
    const empresaId = req.empresaId;

    const conditions = [eq(funcionariosTable.id, id)];
    if (empresaId) conditions.push(eq(funcionariosTable.empresa_id, empresaId));

    const [row] = await db
      .select()
      .from(funcionariosTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions));

    if (!row) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    res.json(row);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.put("/funcionarios/:id", async (req, res) => {
  try {
    const { id } = UpdateFuncionarioParams.parse({ id: Number(req.params.id) });
    const body = UpdateFuncionarioBody.parse(req.body);
    const empresaId = req.empresaId;

    const conditions = [eq(funcionariosTable.id, id)];
    if (empresaId) conditions.push(eq(funcionariosTable.empresa_id, empresaId));

    const [row] = await db
      .update(funcionariosTable)
      .set(body)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    res.json(row);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.delete("/funcionarios/:id", async (req, res) => {
  try {
    const { id } = DeleteFuncionarioParams.parse({ id: Number(req.params.id) });
    const empresaId = req.empresaId;

    const conditions = [eq(funcionariosTable.id, id)];
    if (empresaId) conditions.push(eq(funcionariosTable.empresa_id, empresaId));

    const updated = await db
      .update(funcionariosTable)
      .set({ ativo: false, situacao: "Demitido" })
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .returning();
    if (updated.length === 0) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    res.json({ message: "Funcionário desativado com sucesso", funcionario: updated[0] });
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

// ---------- Arquivos do funcionário ----------

async function ensureFuncionarioOwned(
  funcionarioId: number,
  empresaId: number | undefined,
): Promise<boolean> {
  const conditions = [eq(funcionariosTable.id, funcionarioId)];
  if (empresaId) conditions.push(eq(funcionariosTable.empresa_id, empresaId));
  const [row] = await db
    .select({ id: funcionariosTable.id })
    .from(funcionariosTable)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));
  return !!row;
}

router.get("/funcionarios/:id/arquivos", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }
    if (!(await ensureFuncionarioOwned(id, req.empresaId))) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    const rows = await db
      .select()
      .from(funcionarioArquivosTable)
      .where(eq(funcionarioArquivosTable.funcionario_id, id))
      .orderBy(desc(funcionarioArquivosTable.criado_em));
    res.json(rows);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.post(
  "/funcionarios/:id/arquivos",
  upload.single("file"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }
      if (!(await ensureFuncionarioOwned(id, req.empresaId))) {
        // Clean up the uploaded file if any
        if (req.file?.path) fs.unlink(req.file.path, () => undefined);
        res.status(404).json({ error: "Funcionário não encontrado" });
        return;
      }
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
        return;
      }
      const relativePath = path.relative(UPLOADS_ROOT, file.path);
      const [row] = await db
        .insert(funcionarioArquivosTable)
        .values({
          funcionario_id: id,
          nome_arquivo: file.originalname,
          tipo_arquivo: file.mimetype,
          caminho: relativePath,
        })
        .returning();
      res.status(201).json(row);
    } catch (err: unknown) {
      if (req.file?.path) fs.unlink(req.file.path, () => undefined);
      res.status(400).json({ error: errMsg(err) });
    }
  },
);

router.get("/funcionarios/:id/arquivos/:arquivoId/download", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const arquivoId = Number(req.params.arquivoId);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(arquivoId) || arquivoId <= 0) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }
    if (!(await ensureFuncionarioOwned(id, req.empresaId))) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    const [arquivo] = await db
      .select()
      .from(funcionarioArquivosTable)
      .where(
        and(
          eq(funcionarioArquivosTable.id, arquivoId),
          eq(funcionarioArquivosTable.funcionario_id, id),
        ),
      );
    if (!arquivo) {
      res.status(404).json({ error: "Arquivo não encontrado" });
      return;
    }
    const absolutePath = path.resolve(UPLOADS_ROOT, arquivo.caminho);
    if (!absolutePath.startsWith(UPLOADS_ROOT)) {
      res.status(400).json({ error: "Caminho inválido" });
      return;
    }
    if (!fs.existsSync(absolutePath)) {
      res.status(404).json({ error: "Arquivo não existe no disco" });
      return;
    }
    res.setHeader("Content-Type", arquivo.tipo_arquivo);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(arquivo.nome_arquivo)}"`,
    );
    fs.createReadStream(absolutePath).pipe(res);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

router.delete("/funcionarios/:id/arquivos/:arquivoId", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const arquivoId = Number(req.params.arquivoId);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(arquivoId) || arquivoId <= 0) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }
    if (!(await ensureFuncionarioOwned(id, req.empresaId))) {
      res.status(404).json({ error: "Funcionário não encontrado" });
      return;
    }
    const [arquivo] = await db
      .select()
      .from(funcionarioArquivosTable)
      .where(
        and(
          eq(funcionarioArquivosTable.id, arquivoId),
          eq(funcionarioArquivosTable.funcionario_id, id),
        ),
      );
    if (!arquivo) {
      res.status(404).json({ error: "Arquivo não encontrado" });
      return;
    }
    await db
      .delete(funcionarioArquivosTable)
      .where(eq(funcionarioArquivosTable.id, arquivoId));
    const absolutePath = path.resolve(UPLOADS_ROOT, arquivo.caminho);
    if (absolutePath.startsWith(UPLOADS_ROOT) && fs.existsSync(absolutePath)) {
      fs.unlink(absolutePath, () => undefined);
    }
    res.json({ message: "Arquivo removido" });
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

export default router;
