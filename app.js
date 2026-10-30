// SISTEMA DE FICHAS ODONTOLÓGICAS
// La base de datos controla los cupos. Esta página solo muestra y envía solicitudes.

// 1. Conectar con Supabase utilizando los datos públicos de config.js.
const conectado = SUPABASE_URL.startsWith('https://') &&
                  !SUPABASE_URL.includes('PEGAR_') &&
                  !SUPABASE_PUBLISHABLE_KEY.includes('PEGAR_');
const supabaseHospital = conectado
    ? supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

// 2. Cambiar de sección usando los botones del menú.
function mostrarSeccion(nombre) {
    document.querySelectorAll('.seccion').forEach(function (seccion) {
        seccion.classList.toggle('activo', seccion.id === nombre);
    });
    document.querySelectorAll('.tabs button').forEach(function (boton) {
        boton.classList.toggle('activo', boton.dataset.target === nombre);
    });
    window.scrollTo(0, 0);
    if (nombre === 'hospital') revisarSesion();
}

document.querySelectorAll('.tabs button').forEach(function (boton) {
    boton.addEventListener('click', function () {
        mostrarSeccion(boton.dataset.target);
    });
});

// 3. Elegir fecha: hoy o los próximos 30 días (hora de Bolivia).
const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const limite = new Date(hoy + 'T12:00:00Z');
limite.setUTCDate(limite.getUTCDate() + 30);
const ultimoDia = limite.toISOString().slice(0, 10);

['fecha', 'fechaHospital'].forEach(function (id) {
    const campo = document.getElementById(id);
    campo.min = hoy;
    campo.max = ultimoDia;
    campo.value = hoy;
});

if (!conectado) {
    document.getElementById('configAviso').classList.remove('oculto');
}

// 4. Consultar las fichas que quedan para una fecha.
let cupos = null;
async function consultarCupos() {
    const fecha = document.getElementById('fecha').value;
    const aviso = document.getElementById('cupos');
    cupos = null;
    document.getElementById('enviar').disabled = true;

    if (!supabaseHospital) {
        aviso.textContent = 'Primero configura Supabase en config.js.';
        return;
    }
    if (fecha < hoy || fecha > ultimoDia) {
        aviso.textContent = 'Elige una fecha válida.';
        return;
    }
    aviso.textContent = 'Consultando disponibilidad...';

    const respuesta = await supabaseHospital.rpc('disponibilidad_fichas', { p_fecha: fecha });
    if (document.getElementById('fecha').value !== fecha) return;
    if (respuesta.error) {
        aviso.textContent = 'Error al consultar: ' + respuesta.error.message;
        return;
    }
    cupos = respuesta.data;
    aviso.textContent = 'Comunidades: ' + cupos.comunidad + ' de 2 disponibles. ' +
                          'Generales: ' + cupos.general + ' de 2 disponibles.';
    comprobarCupo();
}

// 5. Bloquear el botón si ya no quedan fichas.
function comprobarCupo() {
    const tipo = document.getElementById('categoria').value;
    const boton = document.getElementById('enviar');
    const mensaje = document.getElementById('resultado');
    boton.disabled = !cupos || !tipo || cupos[tipo] <= 0;
    mensaje.classList.add('oculto');
    if (cupos && tipo && cupos[tipo] <= 0) {
        mensaje.textContent = 'Cupos agotados. Selecciona otra fecha.';
        mensaje.className = 'mensaje error';
    }
}

document.getElementById('fecha').addEventListener('change', consultarCupos);
document.getElementById('categoria').addEventListener('change', function () {
    const comunidad = this.value === 'comunidad';
    document.getElementById('grupoComunidad').classList.toggle('oculto', !comunidad);
    document.getElementById('comunidad').required = comunidad;
    comprobarCupo();
});

// 6. Guardar una solicitud. Supabase impide superar los cupos.
document.getElementById('formReserva').addEventListener('submit', async function (evento) {
    evento.preventDefault();
    if (!supabaseHospital || !cupos || !this.reportValidity()) return;
    const fecha = document.getElementById('fecha').value;
    const categoria = document.getElementById('categoria').value;
    const mensaje = document.getElementById('resultado');
    document.getElementById('enviar').disabled = true;
    mensaje.textContent = 'Registrando solicitud...';
    mensaje.className = 'mensaje info';

    const datos = {
        p_fecha: fecha,
        p_categoria: categoria,
        p_nombre: document.getElementById('nombre').value.trim(),
        p_telefono: document.getElementById('telefono').value.trim(),
        p_comunidad: categoria === 'comunidad'
            ? document.getElementById('comunidad').value.trim() : null
    };
    const respuesta = await supabaseHospital.rpc('solicitar_ficha', datos);
    if (respuesta.error) {
        mensaje.textContent = 'No se pudo registrar: ' + respuesta.error.message;
        mensaje.className = 'mensaje error';
        await consultarCupos();
        mensaje.className = 'mensaje error';
        return;
    }

    const numero = respuesta.data.id;
    const detalle = 'Solicitud N.º ' + numero + ' para el ' + fecha +
        '. Estado: PENDIENTE. Espera la confirmación del hospital.';
    document.getElementById('detalleExito').textContent = detalle;
    const texto = 'Hola, deseo consultar mi solicitud odontológica N.º ' + numero +
        ' para el ' + fecha + '.';
    document.getElementById('enlaceWa').href = 'https://wa.me/' +
        WHATSAPP_HOSPITAL + '?text=' + encodeURIComponent(texto);
    document.getElementById('exito').classList.remove('oculto');
    this.reset();
    document.getElementById('fecha').value = fecha;
    document.getElementById('grupoComunidad').classList.add('oculto');
    document.getElementById('comunidad').required = false;
    mostrarSeccion('informacion');
    await consultarCupos();
});

// 7. Acceso exclusivo del personal autorizado del hospital.
document.getElementById('formLogin').addEventListener('submit', async function (evento) {
    evento.preventDefault();
    if (!supabaseHospital) return;
    const correo = document.getElementById('correo').value;
    const clave = document.getElementById('clave').value;
    const respuesta = await supabaseHospital.auth.signInWithPassword({ email: correo, password: clave });
    if (respuesta.error) {
        document.getElementById('hospitalMensaje').textContent = respuesta.error.message;
        document.getElementById('hospitalMensaje').className = 'mensaje error';
    } else {
        document.getElementById('hospitalMensaje').classList.add('oculto');
        revisarSesion();
    }
});

async function revisarSesion() {
    if (!supabaseHospital) return;
    const respuesta = await supabaseHospital.auth.getUser();
    const ingreso = !!respuesta.data.user;
    document.getElementById('loginZona').classList.toggle('oculto', ingreso);
    document.getElementById('panelZona').classList.toggle('oculto', !ingreso);
    if (ingreso) listarSolicitudes();
}

// 8. Mostrar solicitudes y permitir confirmar o rechazar.
async function listarSolicitudes() {
    if (!supabaseHospital) return;
    const fecha = document.getElementById('fechaHospital').value;
    const lista = document.getElementById('listaHospital');
    lista.textContent = 'Cargando solicitudes...';
    const respuesta = await supabaseHospital.rpc('listar_fichas_hospital', { p_fecha: fecha });
    if (respuesta.error) {
        lista.textContent = 'No se pudo consultar: ' + respuesta.error.message;
        return;
    }
    lista.replaceChildren();
    if (!respuesta.data.length) {
        lista.textContent = 'No hay solicitudes para esta fecha.';
        return;
    }
    respuesta.data.forEach(function (ficha) {
        const tarjeta = document.createElement('article');
        tarjeta.className = 'item';
        const titulo = document.createElement('h3');
        titulo.textContent = 'Ficha N.º ' + ficha.id + ' - ' + ficha.estado;
        tarjeta.appendChild(titulo);
        ['Paciente: ' + ficha.nombre, 'Teléfono: ' + ficha.telefono,
         'Tipo: ' + ficha.categoria, 'Comunidad: ' + (ficha.comunidad || 'No aplica')]
         .forEach(function (linea) {
            const parrafo = document.createElement('p');
            parrafo.textContent = linea;
            tarjeta.appendChild(parrafo);
         });
        if (ficha.estado === 'pendiente') {
            crearBotonEstado(tarjeta, ficha.id, 'confirmada', 'Confirmar');
            crearBotonEstado(tarjeta, ficha.id, 'rechazada', 'Rechazar');
        }
        lista.appendChild(tarjeta);
    });
}

function crearBotonEstado(tarjeta, id, estado, nombre) {
    const boton = document.createElement('button');
    boton.textContent = nombre;
    boton.className = estado === 'confirmada' ? 'primario' : 'secundario';
    boton.addEventListener('click', async function () {
        if (!confirm('¿' + nombre + ' la solicitud ' + id + '?')) return;
        boton.disabled = true;
        const respuesta = await supabaseHospital.rpc('cambiar_estado_ficha', {
            p_id: id, p_estado: estado
        });
        if (respuesta.error) alert(respuesta.error.message);
        listarSolicitudes();
        consultarCupos();
    });
    tarjeta.appendChild(boton);
}

document.getElementById('actualizar').addEventListener('click', listarSolicitudes);
document.getElementById('fechaHospital').addEventListener('change', listarSolicitudes);
document.getElementById('salir').addEventListener('click', async function () {
    await supabaseHospital.auth.signOut();
    revisarSesion();
});

// 9. Mostrar la disponibilidad al abrir la página.
consultarCupos();
