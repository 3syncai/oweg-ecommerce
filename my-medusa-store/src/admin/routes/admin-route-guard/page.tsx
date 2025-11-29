import { useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"

const AdminRouteGuard = () => {
  const navigate = useNavigate()
  const location = useLocation()
  
  useEffect(() => {
    const isLoginPage = location.pathname === "/app/login"
    
    if (!isLoginPage) {
      const adminToken = localStorage.getItem("admin_token")
      
      // If admin route but no token, redirect to login
      if (!adminToken) {
        navigate("/app/login")
        return
      }
    }
  }, [location.pathname, navigate])

  return null
}

export default AdminRouteGuard

