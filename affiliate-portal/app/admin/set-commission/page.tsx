"use client"

import { useEffect, useState } from "react"
import { Search, Plus, Edit, Trash2, Package, Tag, Boxes, Type, Save, X } from "lucide-react"

interface Commission {
  id: string
  product_id?: string | null
  category_id?: string | null
  collection_id?: string | null
  type_id?: string | null
  commission_rate: number
  product?: { id: string; title: string }
  category?: { id: string; name: string }
  collection?: { id: string; title: string }
  type?: { id: string; value: string }
}

interface FilterOption {
  id: string
  name?: string
  title?: string
  value?: string
}

export default function SetCommissionPage() {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editingCommission, setEditingCommission] = useState<Commission | null>(null)
  const [formData, setFormData] = useState({
    commission_type: "product" as "product" | "category" | "collection" | "type",
    entity_id: "",
    commission_rate: "",
  })
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<FilterOption[]>([])
  const [collections, setCollections] = useState<FilterOption[]>([])
  const [types, setTypes] = useState<FilterOption[]>([])

  useEffect(() => {
    loadCommissions()
    loadProducts()
  }, [])

  const loadCommissions = async () => {
    try {
      const { apiRequest } = await import("../../../lib/api-client")
      const response = await apiRequest("/affiliate/admin/commissions")

      if (response.ok) {
        const data = await response.json()
        setCommissions(data.commissions || [])
      } else {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
        console.error("Failed to fetch commissions:", response.status, errorData)
        alert(`Failed to load commissions: ${errorData.message || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Failed to fetch commissions:", error)
      alert(`Error loading commissions: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setLoading(false)
    }
  }

  const loadProducts = async () => {
    try {
      const { apiRequest } = await import("../../../lib/api-client")
      const response = await apiRequest("/affiliate/admin/products")

      if (response.ok) {
        const data = await response.json()
        setProducts(data.products || [])
        
        // Extract unique categories, collections, and types
        const uniqueCategories = new Map<string, FilterOption>()
        const uniqueCollections = new Map<string, FilterOption>()
        const uniqueTypes = new Map<string, FilterOption>()

        data.products?.forEach((product: any) => {
          product.categories?.forEach((cat: any) => {
            if (!uniqueCategories.has(cat.id)) {
              uniqueCategories.set(cat.id, { id: cat.id, name: cat.name })
            }
          })
          if (product.collection) {
            if (!uniqueCollections.has(product.collection.id)) {
              uniqueCollections.set(product.collection.id, {
                id: product.collection.id,
                title: product.collection.title,
              })
            }
          }
          if (product.type) {
            if (!uniqueTypes.has(product.type.id)) {
              uniqueTypes.set(product.type.id, {
                id: product.type.id,
                value: product.type.value,
              })
            }
          }
        })

        setCategories(Array.from(uniqueCategories.values()))
        setCollections(Array.from(uniqueCollections.values()))
        setTypes(Array.from(uniqueTypes.values()))
      } else {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
        console.error("Failed to fetch products:", response.status, errorData)
        alert(`Failed to load products: ${errorData.message || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Failed to fetch products:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      alert(`Error loading products: ${errorMessage}. Please check if the backend server is running.`)
    }
  }

  const handleSave = async () => {
    // Validate entity_id
    if (!formData.entity_id || formData.entity_id.trim() === "") {
      alert("Please select a " + formData.commission_type)
      return
    }

    // Validate commission_rate
    if (!formData.commission_rate || formData.commission_rate.trim() === "") {
      alert("Please enter a commission rate")
      return
    }

    const trimmedRate = formData.commission_rate.trim()
    
    // Check if trimmed rate is empty
    if (!trimmedRate || trimmedRate === "") {
      alert("Please enter a commission rate")
      return
    }
    
    const commissionRate = parseFloat(trimmedRate)
    
    if (isNaN(commissionRate) || !isFinite(commissionRate)) {
      alert("Commission rate must be a valid number")
      return
    }
    
    if (commissionRate < 0 || commissionRate > 100) {
      alert("Commission rate must be between 0 and 100")
      return
    }

    // Double-check we have a valid number
    if (typeof commissionRate !== 'number') {
      alert("Please enter a valid commission rate")
      return
    }
    
    console.log("Validated commission rate:", commissionRate, "Type:", typeof commissionRate)

    setSaving(true)
    try {
      const { apiRequest } = await import("../../../lib/api-client")
      let response

      if (editingCommission) {
        // Update existing commission
        const requestBody = {
          commission_rate: commissionRate,
        }
        console.log("Updating commission:", requestBody)
        
        response = await apiRequest(`/affiliate/admin/commissions/${editingCommission.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        })
      } else {
        // Create new commission
        const body: any = {
          commission_rate: commissionRate,
        }
        
        // Set the appropriate entity ID based on commission type
        if (formData.commission_type === "product") {
          body.product_id = formData.entity_id
        } else if (formData.commission_type === "category") {
          body.category_id = formData.entity_id
        } else if (formData.commission_type === "collection") {
          body.collection_id = formData.entity_id
        } else if (formData.commission_type === "type") {
          body.type_id = formData.entity_id
        }
        
        const requestBody = {
          ...body,
          commission_rate: commissionRate, // Ensure it's explicitly set as a number
        }
        
        console.log("Creating commission with body:", JSON.stringify(requestBody, null, 2))
        console.log("Commission rate value:", commissionRate, "Type:", typeof commissionRate)
        console.log("Request body stringified:", JSON.stringify(requestBody))

        response = await apiRequest("/affiliate/admin/commissions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        })
        
        console.log("Response status:", response.status)
        console.log("Response ok:", response.ok)
      }

      if (response.ok) {
        await loadCommissions()
        setShowForm(false)
        setEditingCommission(null)
        setFormData({
          commission_type: "product",
          entity_id: "",
          commission_rate: "",
        })
        alert(editingCommission ? "Commission updated successfully" : "Commission created successfully")
      } else {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
        alert(`Failed to save commission: ${errorData.message || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Failed to save commission:", error)
      alert(`Error saving commission: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (commissionId: string) => {
    if (!confirm("Are you sure you want to delete this commission?")) {
      return
    }

    try {
      const { apiRequest } = await import("../../../lib/api-client")
      const response = await apiRequest(`/affiliate/admin/commissions/${commissionId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        await loadCommissions()
        alert("Commission deleted successfully")
      } else {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
        alert(`Failed to delete commission: ${errorData.message || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Failed to delete commission:", error)
      alert(`Error deleting commission: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const handleEdit = (commission: Commission) => {
    setEditingCommission(commission)
    let commissionType: "product" | "category" | "collection" | "type" = "product"
    let entityId = ""

    if (commission.product_id) {
      commissionType = "product"
      entityId = commission.product_id
    } else if (commission.category_id) {
      commissionType = "category"
      entityId = commission.category_id
    } else if (commission.collection_id) {
      commissionType = "collection"
      entityId = commission.collection_id
    } else if (commission.type_id) {
      commissionType = "type"
      entityId = commission.type_id
    }

    setFormData({
      commission_type: commissionType,
      entity_id: entityId,
      commission_rate: commission.commission_rate.toString(),
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingCommission(null)
    setFormData({
      commission_type: "product",
      entity_id: "",
      commission_rate: "",
    })
  }

  const getEntityName = (commission: Commission): string => {
    if (commission.product_id && commission.product) {
      return commission.product.title
    } else if (commission.category_id && commission.category) {
      return commission.category.name || "Unknown Category"
    } else if (commission.collection_id && commission.collection) {
      return commission.collection.title || "Unknown Collection"
    } else if (commission.type_id && commission.type) {
      return commission.type.value || "Unknown Type"
    }
    return "Unknown"
  }

  const getEntityType = (commission: Commission): string => {
    if (commission.product_id) return "Product"
    if (commission.category_id) return "Category"
    if (commission.collection_id) return "Collection"
    if (commission.type_id) return "Type"
    return "Unknown"
  }

  const filteredCommissions = commissions.filter((comm) => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      getEntityName(comm).toLowerCase().includes(search) ||
      getEntityType(comm).toLowerCase().includes(search) ||
      comm.commission_rate.toString().includes(search)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-500">Loading commissions...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Set Commission</h1>
          <p className="text-gray-600 mt-1">Manage commission rates for products, categories, collections, and types</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Commission
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search commissions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingCommission ? "Edit Commission" : "Add Commission"}
              </h2>
              <button onClick={handleCancel} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Commission Type
                </label>
                <select
                  value={formData.commission_type}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      commission_type: e.target.value as any,
                      entity_id: "",
                    })
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 appearance-none cursor-pointer"
                  disabled={!!editingCommission}
                >
                  <option value="product">Product</option>
                  <option value="category">Category</option>
                  <option value="collection">Collection</option>
                  <option value="type">Type</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {formData.commission_type === "product"
                    ? "Product"
                    : formData.commission_type === "category"
                    ? "Category"
                    : formData.commission_type === "collection"
                    ? "Collection"
                    : "Type"}
                </label>
                <select
                  value={formData.entity_id}
                  onChange={(e) => setFormData({ ...formData, entity_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 appearance-none cursor-pointer"
                >
                  <option value="">Select {formData.commission_type}</option>
                  {formData.commission_type === "product" &&
                    products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.title}
                      </option>
                    ))}
                  {formData.commission_type === "category" &&
                    categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  {formData.commission_type === "collection" &&
                    collections.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.title}
                      </option>
                    ))}
                  {formData.commission_type === "type" &&
                    types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.value}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Commission Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.commission_rate}
                  onChange={(e) => {
                    const value = e.target.value
                    // Allow empty string for typing, but validate on submit
                    setFormData((prev) => ({ ...prev, commission_rate: value }))
                  }}
                  onBlur={(e) => {
                    // Trim whitespace on blur
                    const value = e.target.value.trim()
                    setFormData((prev) => ({ ...prev, commission_rate: value }))
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., 5 for 5%"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter a percentage (0-100). For example, 5 means 5% commission.
                </p>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {editingCommission ? "Update" : "Create"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commissions Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Commission Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCommissions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    {commissions.length === 0
                      ? "No commissions set. Click 'Add Commission' to create one."
                      : "No commissions match your search."}
                  </td>
                </tr>
              ) : (
                filteredCommissions.map((commission) => (
                  <tr key={commission.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {commission.product_id && <Package className="w-4 h-4 mr-2 text-blue-500" />}
                        {commission.category_id && <Tag className="w-4 h-4 mr-2 text-green-500" />}
                        {commission.collection_id && <Boxes className="w-4 h-4 mr-2 text-purple-500" />}
                        {commission.type_id && <Type className="w-4 h-4 mr-2 text-orange-500" />}
                        <span className="text-sm font-medium text-gray-900">
                          {getEntityType(commission)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{getEntityName(commission)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-indigo-600">
                        {commission.commission_rate}%
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(commission)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(commission.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

