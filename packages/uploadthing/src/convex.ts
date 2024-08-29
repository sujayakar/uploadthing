import { createBuilder, type CreateBuilderOptions } from "./internal/upload-builder";
import { getStatusCodeFromError, type Json } from "@uploadthing/shared";
import { type FileRouter, RouteHandlerOptions } from "./internal/types";
import { buildPermissionsInfoHandler, buildRequestHandler, runRequestHandlerAsync } from "./internal/handler";
import { DataModelFromSchemaDefinition, GenericActionCtx, GenericDataModel, httpActionGeneric, HttpRouter, SchemaDefinition } from "convex/server"
import { UPLOADTHING_VERSION } from "./internal/constants";
import { formatError } from "./internal/error-formatter";

export type { FileRouter };

type MiddlewareArgs<DataModel extends GenericDataModel> = { req: Request, res: undefined; event: GenericActionCtx<DataModel> };

type ConvexBuilderOptions<TErrorShape extends Json, SchemaDef extends SchemaDefinition<any, boolean>> = CreateBuilderOptions<TErrorShape> & {
  schema?: SchemaDef
}

export const createUploadthing = <TErrorShape extends Json, SchemaDef extends SchemaDefinition<any, boolean>>(
  opts?: ConvexBuilderOptions<TErrorShape, SchemaDef>,
) => createBuilder<MiddlewareArgs<DataModelFromSchemaDefinition<SchemaDef>>, TErrorShape>(opts);

export const installUploadthingRoutes = <TRouter extends FileRouter>(
  router: HttpRouter,
  opts: RouteHandlerOptions<TRouter>,
) => {
  const requestHandler = buildRequestHandler<TRouter, MiddlewareArgs<GenericDataModel>>(
    opts,
    "convex",
  );
  const getBuildPerms = buildPermissionsInfoHandler<TRouter>(opts);

  router.route({
    method: "OPTIONS",
    path: "/api/uploadthing",
    handler: httpActionGeneric(async (_ctx, req) => {
      const { headers } = req;
      const isCorsRequest = headers.get("Origin") != null
        && headers.get("Access-Control-Request-Method") != null
        && headers.get("Access-Control-Request-Headers") != null;
      if (!isCorsRequest) {
        return new Response();
      }
      if (!process.env.CLIENT_ORIGIN) {
        throw new Error("Convex deployment doesn't have CLIENT_ORIGIN set");
      }
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN,
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        }
      })
    })
  })
  router.route({
    method: "GET",
    path: "/api/uploadthing",
    handler: httpActionGeneric(async () => {
      const permissions = getBuildPerms();
      if (!process.env.CLIENT_ORIGIN) {
        throw new Error("Convex deployment doesn't have CLIENT_ORIGIN set");
      }
      return new Response(JSON.stringify(permissions), {
        headers: {
          "X-Uploadthing-Version": UPLOADTHING_VERSION,
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN,
          "Vary": "Origin",
        }
      });
    })
  })
  router.route({
    method: "POST",
    path: "/api/uploadthing",
    handler: httpActionGeneric(async (ctx, req) => {
      if (!process.env.CLIENT_ORIGIN) {
        throw new Error("Convex deployment doesn't have CLIENT_ORIGIN set");
      }
      const headers = {
        "X-Uploadthing-Version": UPLOADTHING_VERSION,
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN,
        "Vary": "Origin",
      }
      const response = await runRequestHandlerAsync(
        requestHandler,
        {
          req,
          middlewareArgs: { req, res: undefined, event: ctx },
        },
        opts.config,
      )
      if (response.success === false) {
        return new Response(JSON.stringify(formatError(response.error, opts.router)), {
          status: getStatusCodeFromError(response.error),
          headers,
        })
      }
      if (!response.body) {
        return new Response(JSON.stringify({ ok: true }), {
          headers,
        })
      }
      return new Response(JSON.stringify(response.body), {
        headers,
      })
    })
  })
}