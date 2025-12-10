"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const core_flows_1 = require("@medusajs/core-flows");
const utils_1 = require("@medusajs/framework/utils");
async function refetchCustomer(customerId, scope, fields) {
    const remoteQuery = scope.resolve(utils_1.ContainerRegistrationKeys.REMOTE_QUERY);
    const queryObject = (0, utils_1.remoteQueryObjectFromString)({
        entryPoint: "customer",
        variables: {
            filters: { id: customerId },
        },
        fields: fields || [],
    });
    const customers = await remoteQuery(queryObject);
    return customers?.[0];
}
async function POST(req, res) {
    const authContext = req.auth_context;
    if (authContext?.actor_id) {
        throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_DATA, "Request already authenticated as a customer.");
    }
    const body = req.validatedBody;
    const customerData = {
        email: body.email,
        first_name: body.first_name,
        last_name: body.last_name,
        phone: body.phone,
        customer_type: body.customer_type,
        company_name: body.customer_type === "business" ? body.company_name ?? null : null,
        gst_number: body.customer_type === "business" ? body.gst_number ?? null : null,
        referral_code: body.referral_code ?? null,
        newsletter_subscribe: body.newsletter_subscribe ?? false,
    };
    const workflow = (0, core_flows_1.createCustomerAccountWorkflow)(req.scope);
    const workflowInput = {
        customerData,
    };
    if (authContext?.auth_identity_id) {
        workflowInput.authIdentityId = authContext.auth_identity_id;
    }
    const { result } = await workflow.run({
        input: workflowInput,
    });
    const customer = await refetchCustomer(result.id, req.scope, req.queryConfig?.fields);
    res.status(200).json({ customer });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL2N1c3RvbWVycy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQThCQSxvQkFvREM7QUFsRkQscURBQW9FO0FBRXBFLHFEQUtrQztBQUlsQyxLQUFLLFVBQVUsZUFBZSxDQUM1QixVQUFrQixFQUNsQixLQUE2QixFQUM3QixNQUFpQjtJQUVqQixNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUMvQixpQ0FBeUIsQ0FBQyxZQUFZLENBQ3ZDLENBQUE7SUFDRCxNQUFNLFdBQVcsR0FBRyxJQUFBLG1DQUEyQixFQUFDO1FBQzlDLFVBQVUsRUFBRSxVQUFVO1FBQ3RCLFNBQVMsRUFBRTtZQUNULE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUU7U0FDNUI7UUFDRCxNQUFNLEVBQUUsTUFBTSxJQUFJLEVBQUU7S0FDckIsQ0FBQyxDQUFBO0lBQ0YsTUFBTSxTQUFTLEdBQUcsTUFBTSxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUE7SUFDaEQsT0FBTyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQTtBQUN2QixDQUFDO0FBRU0sS0FBSyxVQUFVLElBQUksQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ2hFLE1BQU0sV0FBVyxHQUFJLEdBS25CLENBQUMsWUFBWSxDQUFBO0lBRWYsSUFBSSxXQUFXLEVBQUUsUUFBUSxFQUFFLENBQUM7UUFDMUIsTUFBTSxJQUFJLG1CQUFXLENBQ25CLHdCQUFnQixDQUFDLFlBQVksRUFDN0IsOENBQThDLENBQy9DLENBQUE7SUFDSCxDQUFDO0lBRUQsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLGFBQXdDLENBQUE7SUFFekQsTUFBTSxZQUFZLEdBQUc7UUFDbkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1FBQ2pCLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtRQUMzQixTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVM7UUFDekIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1FBQ2pCLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFBYTtRQUNqQyxZQUFZLEVBQ1YsSUFBSSxDQUFDLGFBQWEsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ3RFLFVBQVUsRUFDUixJQUFJLENBQUMsYUFBYSxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDcEUsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhLElBQUksSUFBSTtRQUN6QyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsb0JBQW9CLElBQUksS0FBSztLQUN6RCxDQUFBO0lBRUQsTUFBTSxRQUFRLEdBQUcsSUFBQSwwQ0FBNkIsRUFBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUE7SUFFekQsTUFBTSxhQUFhLEdBQUc7UUFDcEIsWUFBWTtLQUNOLENBQUE7SUFFUixJQUFJLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDO1FBQ2xDLGFBQWEsQ0FBQyxjQUFjLEdBQUcsV0FBVyxDQUFDLGdCQUFnQixDQUFBO0lBQzdELENBQUM7SUFFRCxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsTUFBTSxRQUFRLENBQUMsR0FBRyxDQUFDO1FBQ3BDLEtBQUssRUFBRSxhQUFhO0tBQ3JCLENBQUMsQ0FBQTtJQUVGLE1BQU0sUUFBUSxHQUFHLE1BQU0sZUFBZSxDQUNwQyxNQUFNLENBQUMsRUFBRSxFQUNULEdBQUcsQ0FBQyxLQUFLLEVBQ1IsR0FBRyxDQUFDLFdBQWtELEVBQUUsTUFBOEIsQ0FDeEYsQ0FBQTtJQUVELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQTtBQUNwQyxDQUFDIn0=