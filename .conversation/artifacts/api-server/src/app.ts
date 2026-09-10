import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

type RequestWithRawBody = Request & { rawBody?: Buffer };

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json({
  limit: "100kb",
  verify: (req: Request, _res: Response, body: Buffer) => {
    (req as RequestWithRawBody).rawBody = Buffer.from(body);
  },
}));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
