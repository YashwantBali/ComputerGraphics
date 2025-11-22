var canvas;
var gl;

var mMatrix = mat4.create();    // Model Matrix
var vMatrix = mat4.create();    // View Matrix
var pMatrix = mat4.create();    // Projection Matrix
var wnMatrix = mat4.create();   // World Normal Matrix
var matrixStack = [];

var yAngle = 0.0;
var zAngle = 0.0;
var prevMouseX = 0.0;
var prevMouseY = 0.0;

var aPositionLocation;
var aNormalLocation;
var aTexCoordLocation;

var uVMatrixLocation;
var uMMatrixLocation;
var uPMatrixLocation;
var uWNMatrixLocation;
var uColorLocation;
var uLightPosLocation;
var uEyePosLocation;
var uCubeMapLocation;
var uIntensityLocation;
var uFractionLocation;
var uDiffuseTermLocation;
var uAlphaLocation;
var uRefractLocation;
var uTextureLocation;
var uTexLocation;
var uAmbientLocation;
var uAlphaSpecularLocation;

var LightPos = [-2.0, 5.0, 6.0];
var AlphaSpecular = 35.0;
var Ambient = 0.2;
var Intensity = 1.0;

var eyePos = [0.0, 1.0, 4.0];
var COI = [0.0, 0.0, 0.0];
var viewUp = [0.0, 1.0, 0.0];

var buf;
var indexBuf;
var cubeNormalBuf;
var cubeTexBuf;

var spBuf;
var spIndexBuf;
var spNormalBuf;
var spTexBuf;

var sqVertexPositionBuffer;
var sqVertexIndexBuffer;
var sqTexCoordBuffer;

var objVertexPositionBuffer;
var objVertexNormalBuffer;
var objVertexIndexBuffer;
var objVertexTexCoordsBuffer;

var spVerts = [];
var spIndicies = [];
var spNormals = [];
var spTexCoords = [];

var tex = 0;
var alpha = 0;
var refract = 0;
var fraction = 0.0;

var cubemapTexture;
var sampleTexture;
var earthTexture;
var fenceTexture;
var woodTexture;

var posXTexture;
var negXTexture;
var posYTexture;
var negYTexture;
var posZTexture;
var negZTexture;

var animation;
var degree = 0.0;

var input_JSON = "teapot.json";

const vertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aTexCoord;

uniform mat4 uMMatrix;
uniform mat4 uPMatrix;
uniform mat4 uVMatrix;
uniform vec3 uLightPos;

out vec3 worldPosition;
out vec3 worldNormal;
out vec3 viewSpacePosition;
out vec3 viewSpaceNormal;
out vec3 viewSpaceLight;
out vec2 fragTexCoord;

void main() {
  mat4 projectionModelView;
  projectionModelView=uPMatrix*uVMatrix*uMMatrix;
  gl_Position =  projectionModelView * vec4(aPosition,1.0);

  vec4 worldPos = uMMatrix * vec4(aPosition, 1.0);
  worldPosition = worldPos.xyz;

  mat3 WNMatrix = transpose(inverse(mat3(uMMatrix)));
  worldNormal = normalize(WNMatrix * aNormal);

  mat4 ModelView = uVMatrix*uMMatrix;
  viewSpacePosition = (ModelView*vec4(aPosition,1.0)).xyz;

  mat4 NormalTransf = transpose(inverse(ModelView));
  viewSpaceNormal = (NormalTransf*vec4(aNormal,1.0)).xyz;

  viewSpaceLight = (uVMatrix * vec4(uLightPos, 1.0)).xyz;

  fragTexCoord = aTexCoord;
}`;

const fragShaderCode = `#version 300 es
precision mediump float;

in vec3 worldPosition;
in vec3 worldNormal;
in vec3 viewSpacePosition;
in vec3 viewSpaceNormal;
in vec3 viewSpaceLight;
in vec2 fragTexCoord;

uniform vec4 diffuseTerm;
uniform samplerCube cubeMap;
uniform sampler2D imageTexture;
uniform vec3 eyePos;
uniform float uAlphaSpecular;
uniform float uAmbient;
uniform float uIntensity;
uniform int tex;
uniform int alpha;
uniform int refr;
uniform float fraction;

out vec4 fragColor;

void main() {
  vec3 L = normalize(viewSpaceLight - viewSpacePosition);
  vec3 n = normalize(viewSpaceNormal);
  vec3 v = normalize(-viewSpacePosition);
  vec3 r = normalize(reflect(-L,n));

  float diffuse = uIntensity*max(dot(L,n),0.0);
  float specular = uIntensity*pow(max(dot(v,r),0.0),uAlphaSpecular);
  float ambient = uIntensity*uAmbient;

  vec3 finalColor = diffuse*(diffuseTerm.rgb)+ ambient*(diffuseTerm.rgb);

  if(tex == 0) {
    vec3 eyeToSurfaceDir = normalize(worldPosition - eyePos);
    vec3 directionRef;
    if(refr == 0)
        directionRef = normalize(reflect(eyeToSurfaceDir, normalize(worldNormal)));
    else
        directionRef = normalize(refract(eyeToSurfaceDir, normalize(worldNormal), 0.99));

    fragColor = vec4(finalColor,1.0) * fraction + texture(cubeMap, directionRef) * (1.0-fraction) + vec4(specular*(vec3(3,3,3)),1.0) ;
  }
  else {
    if(alpha == -1) {
        fragColor = texture(imageTexture, fragTexCoord) + specular*(vec4(1,1,1,1));
    } 
    else if(alpha == 0) {
        vec2 TexCoord = vec2(fragTexCoord.x, -fragTexCoord.y);
        fragColor = texture(imageTexture, TexCoord);
    }
    else {
      vec4 tex = texture(imageTexture, fragTexCoord);
      if (tex.a < 0.1) discard;            
      fragColor = vec4(0.2, 0.2, 0.2, 1.0); 
    }
  }
}`;

function pushMatrix(stack, m) {
    //javascript only does shallow push
    var copy = mat4.create(m);
    stack.push(copy);
  }
  
function popMatrix(stack) {
    if (stack.length > 0) return stack.pop();
    else console.log("stack has no matrix to pop!");
  }
  
function degToRad(degrees) {
    return (degrees * Math.PI) / 180;
  }
  
function vertexShaderSetup(vertexShaderCode) {
    shader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(shader, vertexShaderCode);
    gl.compileShader(shader);
    // Error check 
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }
  
function fragmentShaderSetup(fragShaderCode) {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(shader, fragShaderCode);
    gl.compileShader(shader);
    // Error check 
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }
  
function initShaders(vertexShaderCode, fragShaderCode) {
    shaderProgram = gl.createProgram();
  
    var vertexShader = vertexShaderSetup(vertexShaderCode);
    var fragmentShader = fragmentShaderSetup(fragShaderCode);
  
    // attach the shaders
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    //link the shader program
    gl.linkProgram(shaderProgram);
  
    // check for compilation and linking status
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.log(gl.getShaderInfoLog(vertexShader));
      console.log(gl.getShaderInfoLog(fragmentShader));
    }
  
    gl.useProgram(shaderProgram);
  
    return shaderProgram;
  }

function initGL(canvas) {
    try {
      gl = canvas.getContext("webgl2"); 
      gl.viewportWidth = canvas.width; // width of the canvas
      gl.viewportHeight = canvas.height; // height
    } catch (e) {}
    if (!gl) {
      alert("WebGL initialization failed");
    }
  }

function initObject() {
  // create and configure a new request
  var xhr = new XMLHttpRequest();
  xhr.open("GET", input_JSON);
  xhr.overrideMimeType("application/json");

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      var data = JSON.parse(xhr.responseText);

      objVertexPositionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, objVertexPositionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.vertexPositions), gl.STATIC_DRAW);
      objVertexPositionBuffer.itemSize = 3;
      objVertexPositionBuffer.numItems = data.vertexPositions.length / 3;

      objVertexNormalBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, objVertexNormalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.vertexNormals), gl.STATIC_DRAW);
      objVertexNormalBuffer.itemSize = 3;
      objVertexNormalBuffer.numItems = data.vertexNormals.length / 3;

      objVertexTexCoordsBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, objVertexTexCoordsBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.vertexTextureCoords), gl.STATIC_DRAW);
      objVertexTexCoordsBuffer.itemSize = 2;
      objVertexTexCoordsBuffer.numItems = data.vertexTextureCoords.length / 2;

      objVertexIndexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, objVertexIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(data.indices), gl.STATIC_DRAW);
      objVertexIndexBuffer.itemSize = 1;
      objVertexIndexBuffer.numItems = data.indices.length;

      initCubeMap();
    }
  };

  xhr.send();
}

function initSphere(slices, stacks, rad) {
  for (var s = 0; s <= slices; s++) {
    var theta = (s * Math.PI) / slices;
    var sinTheta = Math.sin(theta);
    var cosTheta = Math.cos(theta);

    for (var t = 0; t <= stacks; t++) {
      var phi = (t * 2 * Math.PI) / stacks;
      var sinPhi = Math.sin(phi);
      var cosPhi = Math.cos(phi);

      var x = cosPhi * sinTheta;
      var y = cosTheta;
      var z = sinPhi * sinTheta;

      var u = 1 - t / stacks;
      var v = 1 - s / slices;

      spVerts.push(rad * x, rad * y, rad * z);
      spNormals.push(x, y, z);
      spTexCoords.push(u, v);
    }
  }

  for (var s = 0; s < slices; s++) {
    for (var t = 0; t < stacks; t++) {
      var first = s * (stacks + 1) + t;
      var second = first + stacks + 1;

      spIndicies.push(first, second, first + 1);
      spIndicies.push(second, second + 1, first + 1);
    }
  }
}

function initSphereBuffer() {
  var slices = 50;
  var stacks = 50;
  var rad = 1.0;

  initSphere(slices, stacks, rad);

  spBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spVerts), gl.STATIC_DRAW);
  spBuf.itemSize = 3;
  spBuf.numItems = spVerts.length / 3;

  spIndexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(spIndicies), gl.STATIC_DRAW);
  spIndexBuf.itemsize = 1;
  spIndexBuf.numItems = spIndicies.length;

  spNormalBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spNormals), gl.STATIC_DRAW);
  spNormalBuf.itemSize = 3;
  spNormalBuf.numItems = spNormals.length / 3;

  spTexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spTexBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spTexCoords), gl.STATIC_DRAW);
  spTexBuf.itemSize = 2;
  spTexBuf.numItems = spTexCoords.length / 2;
}

function initCubeBuffer() {
  var cubeVerts = [
    // Front
    -0.5, -0.5, 0.5,   0.5, -0.5, 0.5,   0.5, 0.5, 0.5,   -0.5, 0.5, 0.5,
    // Back
    -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, 0.5, -0.5,  -0.5, 0.5, -0.5,
    // Top
    -0.5, 0.5, -0.5,   0.5, 0.5, -0.5,   0.5, 0.5, 0.5,   -0.5, 0.5, 0.5,
    // Bottom
    -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5, 0.5,  -0.5, -0.5, 0.5,
    // Right
    0.5, -0.5, -0.5,   0.5, 0.5, -0.5,   0.5, 0.5, 0.5,   0.5, -0.5, 0.5,
    // Left
    -0.5, -0.5, -0.5,  -0.5, 0.5, -0.5,  -0.5, 0.5, 0.5,  -0.5, -0.5, 0.5
  ];

  buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeVerts), gl.STATIC_DRAW);
  buf.itemSize = 3;
  buf.numItems = cubeVerts.length / 3;

  var cubeNorms = [
    // Front
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Back
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    // Top
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Bottom
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    // Right
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Left
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
  ];

  cubeNormalBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeNorms), gl.STATIC_DRAW);
  cubeNormalBuf.itemSize = 3;
  cubeNormalBuf.numItems = cubeNorms.length / 3;

  var cubeTexCoords = [];
  for (var k = 0; k < 6; k++) {
    cubeTexCoords.push(
      0, 0, 1, 0, 1, 1, 0, 1
    );
  }

  cubeTexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeTexBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeTexCoords), gl.STATIC_DRAW);
  cubeTexBuf.itemSize = 2;
  cubeTexBuf.numItems = cubeTexCoords.length / 2;

  var cubeIdx = [
    0, 1, 2, 0, 2, 3,     // Front
    4, 5, 6, 4, 6, 7,     // Back
    8, 9, 10, 8, 10, 11,  // Top
    12, 13, 14, 12, 14, 15, // Bottom
    16, 17, 18, 16, 18, 19, // Right
    20, 21, 22, 20, 22, 23  // Left
  ];

  indexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIdx), gl.STATIC_DRAW);
  indexBuf.itemSize = 1;
  indexBuf.numItems = cubeIdx.length;
}

function initSquareBuffer() {
    const verts = new Float32Array([
        0.5, 0.5,
        -0.5, 0.5,
        -0.5, -0.5,
        0.5, -0.5
    ]);
    sqVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sqVertexPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    sqVertexPositionBuffer.itemSize = 2;
    sqVertexPositionBuffer.numItems = 4;

    const texCoords = new Float32Array([
        1.0, 1.0,
        0.0, 1.0,
        0.0, 0.0,
        1.0, 0.0
    ]);
    sqTexCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sqTexCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    sqTexCoordBuffer.itemSize = 2;
    sqTexCoordBuffer.numItems = 4;

    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    sqVertexIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sqVertexIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    sqVertexIndexBuffer.itemsize = 1;
    sqVertexIndexBuffer.numItems = 6;
}

function initCubeMap() {
    const cubeFaces = [
        { face: gl.TEXTURE_CUBE_MAP_POSITIVE_X, path: "posx.jpg" },
        { face: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, path: "negx.jpg" },
        { face: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, path: "posy.jpg" },
        { face: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, path: "negy.jpg" },
        { face: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, path: "posz.jpg" },
        { face: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, path: "negz.jpg" }
    ];

    cubemapTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapTexture);

    const level = 0, fmt = gl.RGB, imgWidth = 512, imgHeight = 512, type = gl.UNSIGNED_BYTE;

    for (const side of cubeFaces) {
        gl.texImage2D(side.face, level, fmt, imgWidth, imgHeight, 0, fmt, type, null);
    }

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

    let loaded = 0;
    cubeFaces.forEach(({ face, path }) => {
        const img = new Image();
        img.src = path;
        img.addEventListener("load", () => {
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapTexture);
            gl.texImage2D(face, level, fmt, fmt, type, img);
            loaded++;
            if (loaded === 6) {
                gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
                drawScene();
            }
        });
    });
}

function initTextures(texPath, hasAlpha) {
    const textureObj = gl.createTexture();
    const imgRef = new Image();
    //imgRef.crossOrigin = "anonymous";
    imgRef.src = texPath;
    textureObj.image = imgRef;

    imgRef.onload = function () {
        handleTextureLoaded(textureObj, hasAlpha);
    };
    return textureObj;
}

function handleTextureLoaded(texObj, hasAlpha) {
    gl.bindTexture(gl.TEXTURE_2D, texObj);
    //gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); // flip vertically if needed

    const formatType = hasAlpha === 1 ? gl.RGBA : gl.RGB;
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        formatType,
        formatType,
        gl.UNSIGNED_BYTE,
        texObj.image
    );

    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
}

function drawObject(baseColor) {
    gl.bindBuffer(gl.ARRAY_BUFFER, objVertexPositionBuffer);
    gl.vertexAttribPointer(aPositionLocation, objVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, objVertexNormalBuffer);
    gl.vertexAttribPointer(aNormalLocation, objVertexNormalBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, objVertexTexCoordsBuffer);
    gl.vertexAttribPointer(aTexCoordLocation, objVertexTexCoordsBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, objVertexIndexBuffer);

    gl.uniform4fv(uDiffuseTermLocation, baseColor);
    gl.uniform3fv(uEyePosLocation, eyePos);
    gl.uniform1i(uTexLocation, tex);
    gl.uniform1i(uAlphaLocation, alpha);
    gl.uniform1i(uRefractLocation, refract);
    gl.uniform1f(uFractionLocation, fraction);
    gl.uniform3fv(uLightPosLocation, LightPos);
    gl.uniform1f(uAlphaSpecularLocation, AlphaSpecular);
    gl.uniform1f(uAmbientLocation, Ambient);
    gl.uniform1f(uIntensityLocation, Intensity);

    gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
    gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapTexture);
    gl.uniform1i(uCubeMapLocation, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sampleTexture);
    gl.uniform1i(uTextureLocation, 1);

    gl.drawElements(gl.TRIANGLES, objVertexIndexBuffer.numItems, gl.UNSIGNED_INT, 0);
}

function drawSphere(baseColor) {
    // bind vertex buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
    gl.vertexAttribPointer(aPositionLocation, spBuf.itemSize, gl.FLOAT, false, 0, 0);

    // bind normals
    gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
    gl.vertexAttribPointer(aNormalLocation, spNormalBuf.itemSize, gl.FLOAT, false, 0, 0);

    // bind texture coordinates
    gl.bindBuffer(gl.ARRAY_BUFFER, spTexBuf);
    gl.vertexAttribPointer(aTexCoordLocation, spTexBuf.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);

    // pass uniforms
    gl.uniform4fv(uDiffuseTermLocation, baseColor);
    gl.uniform3fv(uEyePosLocation, eyePos);
    gl.uniform1i(uTexLocation, tex);
    gl.uniform1i(uAlphaLocation, alpha);
    gl.uniform1i(uRefractLocation, refract);
    gl.uniform1f(uFractionLocation, fraction);
    gl.uniform3fv(uLightPosLocation, LightPos);
    gl.uniform1f(uAlphaSpecularLocation, AlphaSpecular);
    gl.uniform1f(uAmbientLocation, Ambient);
    gl.uniform1f(uIntensityLocation, Intensity);

    gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
    gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);

    // bind cube map
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapTexture);
    gl.uniform1i(uCubeMapLocation, 0);

    // bind 2D texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sampleTexture);
    gl.uniform1i(uTextureLocation, 1);

    gl.drawElements(gl.TRIANGLES, spIndexBuf.numItems, gl.UNSIGNED_INT, 0);
}

function drawCube(baseColor) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(aPositionLocation, buf.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuf);
    gl.vertexAttribPointer(aNormalLocation, cubeNormalBuf.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeTexBuf);
    gl.vertexAttribPointer(aTexCoordLocation, cubeTexBuf.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);

    gl.uniform4fv(uDiffuseTermLocation, baseColor);
    gl.uniform3fv(uEyePosLocation, eyePos);
    gl.uniform1i(uTexLocation, tex);
    gl.uniform1i(uAlphaLocation, alpha);
    gl.uniform1i(uRefractLocation, refract);
    gl.uniform1f(uFractionLocation, fraction);
    gl.uniform3fv(uLightPosLocation, LightPos);
    gl.uniform1f(uAlphaSpecularLocation, AlphaSpecular);
    gl.uniform1f(uAmbientLocation, Ambient);
    gl.uniform1f(uIntensityLocation, Intensity);

    gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
    gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapTexture);
    gl.uniform1i(uCubeMapLocation, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sampleTexture);
    gl.uniform1i(uTextureLocation, 1);

    gl.drawElements(gl.TRIANGLES, indexBuf.numItems, gl.UNSIGNED_SHORT, 0);
}

function drawSquare(baseColor) {
    // bind square vertex positions
    gl.bindBuffer(gl.ARRAY_BUFFER, sqVertexPositionBuffer);
    gl.vertexAttribPointer(aPositionLocation, sqVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

    // bind square texture coordinates
    gl.bindBuffer(gl.ARRAY_BUFFER, sqTexCoordBuffer);
    gl.vertexAttribPointer(aTexCoordLocation, sqTexCoordBuffer.itemSize, gl.FLOAT, false, 0, 0);

    // bind indices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sqVertexIndexBuffer);

    // pass uniforms
    gl.uniform4fv(uDiffuseTermLocation, baseColor);
    gl.uniform3fv(uEyePosLocation, eyePos);
    gl.uniform1i(uTexLocation, tex);
    gl.uniform1i(uAlphaLocation, alpha);
    gl.uniform1i(uRefractLocation, refract);
    gl.uniform1f(uFractionLocation, fraction);
    gl.uniform3fv(uLightPosLocation, LightPos);
    gl.uniform1f(uAlphaSpecularLocation, AlphaSpecular);
    gl.uniform1f(uAmbientLocation, Ambient);
    gl.uniform1f(uIntensityLocation, Intensity);

    gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
    gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);

    // bind cube map texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemapTexture);
    gl.uniform1i(uCubeMapLocation, 0);

    // bind 2D texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sampleTexture);
    gl.uniform1i(uTextureLocation, 1);

    // draw the square
    gl.drawElements(gl.TRIANGLES, sqVertexIndexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
}

function drawScene() {
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

    if (animation) {
        window.cancelAnimationFrame(animation);
    }

    const animate = function () {
        // clear the canvas
        gl.clearColor(0.8, 0.8, 0.8, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);

        // animate camera around the scene
        eyePos = [-4 * Math.sin(degToRad(degree)), 1.0, 4 * Math.cos(degToRad(degree))];
        degree = (degree + 0.2) % 360;

        // reset model, view, projection matrices
        mat4.identity(mMatrix);
        mat4.identity(vMatrix);
        vMatrix = mat4.lookAt(eyePos, [0, 0, 0], [0, 1, 0], vMatrix);
        mat4.identity(pMatrix);
        mat4.perspective(60, 1.0, 0.01, 1000, pMatrix);

        // draw six background squares (skybox) 
        const skyboxTransforms = [
            { translate: [0, 0, -15], rotate: [180, [0, 1, 0]], tex: negZTexture },
            { translate: [-15, 0, 0], rotate: [-90, [0, 1, 0]], tex: negXTexture },
            { translate: [15, 0, 0], rotate: [90, [0, 1, 0]], tex: posXTexture },
            { translate: [0, 15, 0], rotate: [-90, [1, 0, 0]], tex: posYTexture },
            { translate: [0, -15, 0], rotate: [90, [1, 0, 0]], tex: negYTexture },
            { translate: [0, 0, 15], rotate: null, tex: posZTexture }
        ];

        skyboxTransforms.forEach((face) => {
            pushMatrix(matrixStack, mMatrix);

            if (face.translate) mMatrix = mat4.translate(mMatrix, face.translate);
            if (face.rotate) mMatrix = mat4.rotate(mMatrix, degToRad(face.rotate[0]), face.rotate[1]);
            mMatrix = mat4.scale(mMatrix, [30.2, 30.2, 1]);

            tex = 1; alpha = 0; refract = 0; fraction = 0;
            sampleTexture = face.tex;

            drawSquare([0, 0, 0.4, 1]);
            mMatrix = popMatrix(matrixStack);
        });

        // global rotation controlled by mouse
        mMatrix = mat4.rotate(mMatrix, degToRad(zAngle), [0, 1, 0]);
        mMatrix = mat4.rotate(mMatrix, degToRad(yAngle), [1, 0, 0]);

        // draw teapot
        pushMatrix(matrixStack, mMatrix);
        mMatrix = mat4.translate(mMatrix, [0, 0.48, -0.3]);
        mMatrix = mat4.scale(mMatrix, [0.1, 0.1, 0.1]);
        tex = 0; alpha = 0; refract = 0; fraction = 0.0;
        drawObject([0, 0, 1, 1]);
        mMatrix = popMatrix(matrixStack);

        // draw fence 
        pushMatrix(matrixStack, mMatrix);
        mMatrix = mat4.translate(mMatrix, [1.0, 0, 1.0]);
        mMatrix = mat4.rotate(mMatrix, degToRad(25), [0, 1, 0]);
        mMatrix = mat4.scale(mMatrix, [0.6, 0.6, 0.6]);
        tex = 1; alpha = 1; refract = 0; fraction = 0.0;
        sampleTexture = fenceTexture;
        drawCube([0, 0, 0.4, 1]);
        mMatrix = popMatrix(matrixStack);

        // draw small sphere
        pushMatrix(matrixStack, mMatrix);
        mMatrix = mat4.translate(mMatrix, [1.0, -0.05, 1.0]);
        mMatrix = mat4.scale(mMatrix, [0.25, 0.25, 0.25]);
        tex = 0; alpha = 0; refract = 0; fraction = 0.4;
        drawSphere([0.1, 0, 0.1, 1]);
        mMatrix = popMatrix(matrixStack);

        // draw Earth-like sphere
        pushMatrix(matrixStack, mMatrix);
        mMatrix = mat4.translate(mMatrix, [-0.25, 0.08, 1.4]);
        mMatrix = mat4.scale(mMatrix, [0.4, 0.4, 0.4]);
        tex = 1; alpha = -1; refract = 0; fraction = 0.5;
        sampleTexture = earthTexture;
        drawSphere([0, 0, 0.4, 1]);
        mMatrix = popMatrix(matrixStack);

        // draw rotated cube 
        pushMatrix(matrixStack, mMatrix);
        mMatrix = mat4.translate(mMatrix, [-1.4, 0.2, 1.2]);
        mMatrix = mat4.rotate(mMatrix, degToRad(-25), [0, 1, 0]);
        mMatrix = mat4.scale(mMatrix, [0.5, 1.2, 0.1]);
        tex = 0; alpha = 0; refract = 1; fraction = 0;
        drawCube([0, 0, 0.4, 1]);
        mMatrix = popMatrix(matrixStack);

        // draw floor 
        pushMatrix(matrixStack, mMatrix);
        mMatrix = mat4.translate(mMatrix, [0, -0.4, 0]);
        mMatrix = mat4.rotate(mMatrix, degToRad(180), [1, 0, 0]);
        mMatrix = mat4.scale(mMatrix, [3.5, 0.1, 2.3]);
        tex = 1; alpha = 0; refract = 0; fraction = 0;
        sampleTexture = woodTexture;
        drawSphere([0, 0, 0.4, 1]);
        mMatrix = popMatrix(matrixStack);

        // draw four wooden pillars 
        const pillarPositions = [
            [2.0, -1.9, 1.0],
            [-2.0, -1.9, 1.0],
            [-2.0, -1.9, -1.0],
            [2.0, -1.9, -1.0]
        ];
        pillarPositions.forEach(pos => {
            pushMatrix(matrixStack, mMatrix);
            mMatrix = mat4.translate(mMatrix, pos);
            mMatrix = mat4.scale(mMatrix, [0.2, 3.0, 0.2]);
            tex = 1; alpha = 0; refract = 0; fraction = 0;
            sampleTexture = woodTexture;
            drawCube([0, 0, 0.4, 1]);
            mMatrix = popMatrix(matrixStack);
        });

        animation = window.requestAnimationFrame(animate);
    };

    animate();
}
function onMouseDown(event) {
    document.addEventListener("mousemove", onMouseMove, false);
    document.addEventListener("mouseup", onMouseUp, false);
    document.addEventListener("mouseout", onMouseOut, false);

    if (
        event.layerX >= 0 && event.layerX <= canvas.width &&
        event.layerY >= 0 && event.layerY <= canvas.height
    ) {
        prevMouseX = event.clientX;
        prevMouseY = canvas.height - event.clientY;
    }
}

function onMouseMove(event) {
    if (
        event.layerX >= 0 && event.layerX <= canvas.width &&
        event.layerY >= 0 && event.layerY <= canvas.height
    ) {
        const currentX = event.clientX;
        const diffX = currentX - prevMouseX;
        zAngle += diffX / 15;
        prevMouseX = currentX;

        const currentY = canvas.height - event.clientY;
        const diffY = currentY - prevMouseY;
        yAngle -= diffY / 15;
        prevMouseY = currentY;

        drawScene();
    }
}

function onMouseUp(event) {
    document.removeEventListener("mousemove", onMouseMove, false);
    document.removeEventListener("mouseup", onMouseUp, false);
    document.removeEventListener("mouseout", onMouseOut, false);
}

function onMouseOut(event) {
    document.removeEventListener("mousemove", onMouseMove, false);
    document.removeEventListener("mouseup", onMouseUp, false);
    document.removeEventListener("mouseout", onMouseOut, false);
}

function webGLStart() {
    canvas = document.getElementById("Texture_Environment_Reflection");
    document.addEventListener("mousedown", onMouseDown, false);

    initGL(canvas);
    shaderProgram = initShaders(vertexShaderCode, fragShaderCode);

    aPositionLocation = gl.getAttribLocation(shaderProgram, "aPosition");
    aNormalLocation = gl.getAttribLocation(shaderProgram, "aNormal");
    aTexCoordLocation = gl.getAttribLocation(shaderProgram, "aTexCoord");

    uMMatrixLocation = gl.getUniformLocation(shaderProgram, "uMMatrix");
    uVMatrixLocation = gl.getUniformLocation(shaderProgram, "uVMatrix");
    uPMatrixLocation = gl.getUniformLocation(shaderProgram, "uPMatrix");
    uDiffuseTermLocation = gl.getUniformLocation(shaderProgram, "diffuseTerm");
    uEyePosLocation = gl.getUniformLocation(shaderProgram, "eyePos");
    uLightPosLocation = gl.getUniformLocation(shaderProgram, "uLightPos");
    uAmbientLocation = gl.getUniformLocation(shaderProgram, "uAmbient");
    uAlphaSpecularLocation = gl.getUniformLocation(shaderProgram, "uAlphaSpecular");
    uIntensityLocation = gl.getUniformLocation(shaderProgram, "uIntensity");
    uTexLocation = gl.getUniformLocation(shaderProgram, "tex");
    uAlphaLocation = gl.getUniformLocation(shaderProgram, "alpha");
    uRefractLocation = gl.getUniformLocation(shaderProgram, "refr");
    uFractionLocation = gl.getUniformLocation(shaderProgram, "fraction");
    uTextureLocation = gl.getUniformLocation(shaderProgram, "imageTexture");
    uCubeMapLocation = gl.getUniformLocation(shaderProgram, "cubeMap");

    gl.enableVertexAttribArray(aPositionLocation);
    gl.enableVertexAttribArray(aNormalLocation);
    gl.enableVertexAttribArray(aTexCoordLocation);

    initSphereBuffer();
    initCubeBuffer();
    initSquareBuffer();

    earthTexture = initTextures("earthmap.jpg", 0);
    fenceTexture = initTextures("fence_alpha.png", 1);
    woodTexture = initTextures("wood_texture.jpg", 0);
    posXTexture = initTextures("posx.jpg", 0);
    negXTexture = initTextures("negx.jpg", 0);
    posYTexture = initTextures("posy.jpg", 0);
    negYTexture = initTextures("negy.jpg", 0);
    posZTexture = initTextures("posz.jpg", 0);
    negZTexture = initTextures("negz.jpg", 0);

    initObject();
}