"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeCustomerRoutesMiddlewares = void 0;
const framework_1 = require("@medusajs/framework");
const authenticate_middleware_1 = require("@medusajs/medusa/dist/api/utils/middlewares/authenticate-middleware");
const middlewares_1 = require("@medusajs/medusa/dist/api/store/customers/middlewares");
const QueryConfig = __importStar(require("@medusajs/medusa/dist/api/store/customers/query-config"));
const validators_1 = require("./validators");
exports.storeCustomerRoutesMiddlewares = middlewares_1.storeCustomerRoutesMiddlewares.map((entry) => {
    if (entry.matcher !== "/store/customers") {
        return entry;
    }
    return {
        ...entry,
        middlewares: [
            (0, authenticate_middleware_1.authenticate)("customer", ["session", "bearer"], {
                allowUnregistered: true,
            }),
            (0, framework_1.validateAndTransformBody)(validators_1.StoreCreateCustomer),
            (0, framework_1.validateAndTransformQuery)(validators_1.StoreGetCustomerParams, QueryConfig.retrieveTransformQueryConfig),
        ],
    };
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWlkZGxld2FyZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL2N1c3RvbWVycy9taWRkbGV3YXJlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxtREFHNEI7QUFDNUIsaUhBQWtHO0FBQ2xHLHVGQUF5SDtBQUN6SCxvR0FBcUY7QUFFckYsNkNBR3FCO0FBRVIsUUFBQSw4QkFBOEIsR0FBRyw0Q0FBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO0lBQzFFLElBQUksS0FBSyxDQUFDLE9BQU8sS0FBSyxrQkFBa0IsRUFBRSxDQUFDO1FBQ3pDLE9BQU8sS0FBSyxDQUFBO0lBQ2QsQ0FBQztJQUVELE9BQU87UUFDTCxHQUFHLEtBQUs7UUFDUixXQUFXLEVBQUU7WUFDWCxJQUFBLHNDQUFZLEVBQUMsVUFBVSxFQUFFLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxFQUFFO2dCQUM5QyxpQkFBaUIsRUFBRSxJQUFJO2FBQ3hCLENBQUM7WUFDRixJQUFBLG9DQUF3QixFQUFDLGdDQUFtQixDQUFDO1lBQzdDLElBQUEscUNBQXlCLEVBQ3ZCLG1DQUFzQixFQUN0QixXQUFXLENBQUMsNEJBQTRCLENBQ3pDO1NBQ0Y7S0FDRixDQUFBO0FBQ0gsQ0FBQyxDQUFDLENBQUEifQ==