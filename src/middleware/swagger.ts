import { FastifyInstance } from "fastify";

export const swagger = async (fastify: FastifyInstance) => {
  /**
   * @entry http://localhost:{port}/documentation/static/index.html
   */
  await fastify.register(require("@fastify/swagger"), {
    hideUntagged: true,
    exposeRoute: true,
    openapi: {
      info: {
        title: "UniSat Open API (swap)",
        description: "",
        version: "0.1.0",
      },
      host: "localhost",
      schemes: ["http"],
      consumes: ["application/json"],
      produces: ["application/json"],
      definitions: {},
      securityDefinitions: {
        // apiKey: {
        //   type: "apiKey",
        //   name: "apiKey",
        //   in: "header",
        // },
      },
    },
    yaml: true,
  });

  await fastify.register(require("@fastify/swagger-ui"), {
    routePrefix: "/documentation",
    uiConfig: {
      docExpansion: "full",
      deepLinking: false,
    },
    uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject, request, reply) => {
      return swaggerObject;
    },
    transformSpecificationClone: true,
  });
};
