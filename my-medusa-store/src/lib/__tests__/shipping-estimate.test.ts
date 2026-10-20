import { test } from "node:test"
import assert from "node:assert/strict"
import { packedPackage, economicalCourier, compareShippingRoutes, validPincode } from "../shipping-estimate"
import type { EasyShipCourier } from "../../services/easy-ship/types"
import { ItlProvider } from "../../services/easy-ship/itl"

const courier = (total = 118, extras: Partial<EasyShipCourier> = {}): EasyShipCourier => ({ courier_id: 1, courier_name: "Surface partner", rate: total,
  freight_charge: total / 1.18, gst_amount: Math.round(total / 1.18 * .18 * 100) / 100,
  prepaid: true, pickup_available: true, is_surface: true, charge_weight: .5, cod: true,
  rto_charges: 0, cod_charges: 0, rating: null, etd: "4 days", ...extras })

test("package uses explicit cm/kg and ceils dimensions without reducing kg", () => {
  const p = packedPackage({ length: 22.1, width: 20, height: 24, weight: 1.2 })
  assert.equal(p.length, 23); assert.equal(p.weight, 1.2)
  assert.equal(p.volumetric_weight, 2.208); assert.equal(p.applied_weight, 2.208)
  assert.equal(packedPackage({ length: 10, width: 10, height: 10, weight: 10 }).weight, 10)
})
test("heavy, oversized, malformed or missing package inputs require correction/manual quote", () => {
  for (const input of [{weight:25},{weight:"900g"},{length:0},{height:-1},{width:"20cm"},{weight:Infinity},{length:1001},{length:100,width:100,height:100},{weight:""}]) {
    assert.throws(() => packedPackage({length:22,width:20,height:24,weight:1.2,...input}))
  }
  assert.equal(validPincode("401107"),true); assert.equal(validPincode("000000"),false); assert.equal(validPincode("401107abc"),false)
})
test("selects lowest eligible complete carrier total, not premium/highest freight", () => {
  const selected = economicalCourier([courier(354),courier(118),courier(59,{is_surface:false}),courier(60,{prepaid:false}),courier(50,{pickup_available:false})])!
  assert.equal(selected.total_logistics_fee,118); assert.equal(selected.freight_charge,100)
})
test("preserves ITL GST and other carrier charges without double tax", () => {
  const selected = economicalCourier([courier(228.65,{freight_charge:180.25,gst_amount:34.88})])!
  assert.equal(selected.freight_charge,193.77); assert.equal(selected.other_carrier_charges,13.52)
  assert.equal(Math.round((selected.freight_charge * 1.18)*100)/100,228.65)
  assert.equal(economicalCourier([courier(118,{gst_amount:null})]),undefined)
  assert.equal(economicalCourier([courier(118,{gst_amount:3})]),undefined)
  assert.equal(economicalCourier([courier(NaN)]),undefined)
})
test("national allowance takes the highest of each destination's economical services", async () => {
  const result = await compareShippingRoutes("401107",[{pincode:"400001",label:"Mumbai"},{pincode:"194101",label:"Leh"}],async pin=>pin==="400001"?[courier(118),courier(590)]:[courier(236),courier(1180)])
  assert.equal(result.total_logistics_fee,236); assert.equal(result.delivery_pincode,"194101"); assert.equal(result.routes.length,2)
})
test("unavailable routes are disclosed; failed routes mark a provisional allowance", async () => {
  const destinations=[{pincode:"400001",label:"Mumbai"},{pincode:"194101",label:"Leh"}]
  const result=await compareShippingRoutes("401107",destinations,async pin=>pin==="400001"?[courier()]:[])
  assert.equal(result.routes[1].status,"unavailable")
  assert.equal(result.coverage_complete,true)
  const partial=await compareShippingRoutes("401107",destinations,async pin=>{if(pin==="194101")throw Error("timeout");return [courier()]})
  assert.equal(partial.coverage_complete,false);assert.equal(partial.routes[1].status,"error")
  await assert.rejects(compareShippingRoutes("401107",destinations,async()=>[]),/manual/)
  await assert.rejects(compareShippingRoutes("401107",destinations,async()=>[courier(118,{gst_amount:null})]),/manual/)
})
test("ITL adapter sends actual kg, declared MRP and rounded cm, retaining tax and eligibility", async () => {
  const oldFetch=global.fetch, token=process.env.ITL_ACCESS_TOKEN, secret=process.env.ITL_SECRET_KEY
  process.env.ITL_ACCESS_TOKEN="fixture";process.env.ITL_SECRET_KEY="fixture"
  let data: Record<string,unknown> = {}
  global.fetch=async (_url,init)=>{
    data=JSON.parse(String(init?.body)).data
    return new Response(JSON.stringify({status:"success",data:[{logistic_id:"1",logistic_name:"Carrier",service_type:"Surface",prepaid:"Y",pickup:"Y",rate:228.65,gst_charges:34.88,freight_charges:180.25}]}),{status:200})
  }
  try {
    const result=await new ItlProvider().listCouriers({pickup_postcode:"401107",delivery_postcode:"110001",weight:25,length:22.1,breadth:20,height:24,declared_value:2150})
    assert.equal(data.shipping_weight_kg,25);assert.equal(data.shipping_length_cms,23);assert.equal(data.product_mrp,2150)
    assert.equal(result.couriers[0].gst_amount,34.88);assert.equal(result.couriers[0].prepaid,true)
  } finally {
    global.fetch=oldFetch
    if(token===undefined)delete process.env.ITL_ACCESS_TOKEN;else process.env.ITL_ACCESS_TOKEN=token
    if(secret===undefined)delete process.env.ITL_SECRET_KEY;else process.env.ITL_SECRET_KEY=secret
  }
})
