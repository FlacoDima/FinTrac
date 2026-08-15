// Importar la configuración y las funciones de Firebase
import { auth } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {
  // Obtener la página actual
  const currentPage = window.location.pathname;
  const isIndexPage = currentPage.includes('index.html') || currentPage === '/' || currentPage.endsWith('/');
  const isDashboardPage = currentPage.includes('dashboard.html');

  // --- Lógica de verificación de estado de autenticación ---
  let authChecked = false;
  onAuthStateChanged(auth, (user) => {
    if (!authChecked) {
      authChecked = true;
      if (isIndexPage && user) {
        // Si estamos en index y hay usuario, redirigir a dashboard
        window.location.href = 'dashboard.html';
      } else if (isDashboardPage && !user) {
        // Si estamos en dashboard y NO hay usuario, redirigir a index
        window.location.href = 'index.html';
      }
    }
  });

  // --- Lógica para cambiar entre formularios (solo en index) ---
  if (isIndexPage) {
    function toggleForms() {
      const loginForm = document.getElementById('loginForm');
      const registerForm = document.getElementById('registerForm');
      loginForm.classList.toggle('active');
      registerForm.classList.toggle('active');
      // Limpiar mensajes de error al cambiar de formulario
      clearAllErrors();
    }

    // Event listeners para los enlaces de cambio de formulario
    const registerLink = document.getElementById('RegisterLink');
    const loginLink = document.getElementById('LoginLink');

    if (registerLink) {
      registerLink.addEventListener('click', (e) => {
        e.preventDefault();
        toggleForms();
      });
    }

    if (loginLink) {
      loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        toggleForms();
      });
    }

    // --- Función para mostrar errores ---
    function showError(inputId, message) {
      const input = document.getElementById(inputId);
      const errorElement = document.getElementById(`${inputId}-error`);
      if (input) {
        input.classList.add('error');
      }
      if (errorElement) {
        errorElement.textContent = message;
      }
    }

    // --- Función para limpiar errores de un campo ---
    function clearError(inputId) {
      const input = document.getElementById(inputId);
      const errorElement = document.getElementById(`${inputId}-error`);
      if (input) {
        input.classList.remove('error');
      }
      if (errorElement) {
        errorElement.textContent = '';
      }
    }

    // --- Función para limpiar todos los errores ---
    function clearAllErrors() {
      const errorElements = document.querySelectorAll('.error-message');
      const errorInputs = document.querySelectorAll('.error');
      errorElements.forEach(el => el.textContent = '');
      errorInputs.forEach(el => el.classList.remove('error'));
    }

    // --- Función para validar nombre completo (al menos nombre y apellido) ---
    function validateFullName(name) {
      const nameParts = name.trim().split(/\s+/);
      return nameParts.length >= 2;
    }

    // --- Función para validar correo electrónico ---
    function validateEmail(email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }

    // --- Función para alternar visibilidad de contraseña ---
    function togglePassword(inputId) {
      const input = document.getElementById(inputId);
      const icon = document.querySelector(`[data-target="${inputId}"]`);

      if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      } else {
        input.type = 'password';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      }
    }

    // --- Event listeners para botones de ver contraseña ---
    const toggleButtons = document.querySelectorAll('.toggle-password');
    toggleButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-target');
        togglePassword(targetId);
      });
    });

    // --- Lógica para Iniciar Sesión ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Evita que la página recargue
        clearAllErrors();

        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const email = emailInput.value;
        const password = passwordInput.value;
        let isValid = true;

        // Validar correo
        if (!validateEmail(email)) {
          showError('login-email', 'Por favor ingrese un correo electrónico válido');
          isValid = false;
        }

        // Validar contraseña
        if (password.length < 8) {
          showError('login-password', 'La contraseña debe tener al menos 8 caracteres');
          isValid = false;
        }

        if (!isValid) return;

        signInWithEmailAndPassword(auth, email, password)
          .then((userCredential) => {
            console.log("¡Sesión iniciada con éxito!", userCredential.user);
            // Redirigir al panel principal
            window.location.href = "dashboard.html";
          })
          .catch((error) => {
            // Mostrar mensajes de error amigables
            if (error.code === 'auth/user-not-found') {
              showError('login-email', 'Correo electrónico no registrado, por favor verifica o crea una cuenta');
            } else if (error.code === 'auth/wrong-password') {
              showError('login-password', 'Contraseña incorrecta, por favor verifica');
            } else if (error.code === 'auth/invalid-email') {
              showError('login-email', 'Correo electrónico inválido, por favor verifica');
            } else if (error.code === 'auth/invalid-credential') {
              showError('login-email', 'Correo o contraseña incorrectos, por favor verifica');
              showError('login-password', 'Correo o contraseña incorrectos, por favor verifica');
            } else if (error.code === 'auth/too-many-requests') {
              showError('login-email', 'Demasiados intentos fallidos, por favor intenta más tarde');
            } else {
              showError('login-email', 'Hubo un error al iniciar sesión, por favor intenta nuevamente');
            }
          });
      });
    }

    // --- Lógica para Crear Cuenta ---
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        clearAllErrors();

        const nameInput = document.getElementById('register-name');
        const emailInput = document.getElementById('register-email');
        const passwordInput = document.getElementById('register-password');
        const confirmPasswordInput = document.getElementById('register-confirm-password');

        const name = nameInput.value;
        const email = emailInput.value;
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        let isValid = true;

        // Validar nombre completo
        if (!validateFullName(name)) {
          showError('register-name', 'Por favor ingrese al menos su nombre completo');
          isValid = false;
        }

        // Validar correo
        if (!validateEmail(email)) {
          showError('register-email', 'Por favor ingrese un correo electrónico válido (ej: nombre@email.com)');
          isValid = false;
        }

        // Validar contraseña
        if (password.length < 8) {
          showError('register-password', 'La contraseña debe tener al menos 8 caracteres');
          isValid = false;
        }
        // Valida que la contraseña contenga al menos una letra mayúscula
        if (!/[A-Z]/.test(password)) {
          showError('register-password', 'La contraseña debe contener al menos una letra mayúscula');
          isValid = false;
        }
        // Valida que la contraseña contenga al menos una letra minúscula
        if (!/[a-z]/.test(password)) {
          showError('register-password', 'La contraseña debe contener al menos una letra minúscula');
          isValid = false;
        }
        // Valida que la contraseña contenga al menos un carácter especial
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
          showError('register-password', 'La contraseña debe contener al menos un carácter especial (!@#$%^&* etc.)');
          isValid = false;
        }

        // Validar que las contraseñas coincidan
        if (password !== confirmPassword) {
          showError('register-confirm-password', 'Las contraseñas no coinciden');
          isValid = false;
        }

        if (!isValid) return;

        createUserWithEmailAndPassword(auth, email, password)
          .then((userCredential) => {
            console.log("¡Cuenta creada!", userCredential.user);
            // Cambiar al formulario de login
            toggleForms();
            // Limpiar formulario de registro
            registerForm.reset();
          })
          .catch((error) => {
            // Mostrar error de Firebase
            if (error.code === 'auth/email-already-in-use') {
              showError('register-email', 'Este correo electrónico ya está registrado');
            } else if (error.code === 'auth/invalid-email') {
              showError('register-email', 'Correo electrónico inválido');
            } else if (error.code === 'auth/weak-password') {
              showError('register-password', 'La contraseña es demasiado débil');
            } else {
              showError('register-email', 'Error al crear la cuenta: ' + error.message);
            }
          });
      });
    }

    // --- Event listeners para limpiar errores cuando el usuario escribe ---
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        clearError(input.id);
      });
    });
  }

  // --- Lógica para Cerrar Sesión (solo en dashboard) ---
  if (isDashboardPage) {
    // Obtener elementos del DOM
    const signOutBtn = document.getElementById('signOutBtn');
    const signOutModalElement = document.getElementById('signOutModal');
    const confirmSignOutBtn = document.getElementById('confirmSignOutBtn');

    if (signOutBtn && signOutModalElement && confirmSignOutBtn) {
      // Inicializar el modal de Bootstrap
      const signOutModal = new bootstrap.Modal(signOutModalElement);

      // Mostrar el modal al hacer clic en el botón de cerrar sesión
      signOutBtn.addEventListener('click', () => {
        signOutModal.show();
      });

      // Cerrar sesión al hacer clic en el botón de confirmación del modal
      confirmSignOutBtn.addEventListener('click', () => {
        signOutModal.hide(); // Ocultar el modal primero
        signOut(auth).then(() => {
          console.log('Sesión cerrada correctamente');
          window.location.href = 'index.html';
        }).catch((error) => {
          console.error('Error al cerrar sesión:', error);
        });
      });
    }
  }
});
