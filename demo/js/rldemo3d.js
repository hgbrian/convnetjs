var rl3d = rl3d || {};
(function(global) {
    var camera, scene, renderer;

    var container;
    var container_width;
    var container_height;
    

    var magent;
    var materials;
    var pixels;
    var pixels2d;
    
    // Show inputs
    var img2d_ctx;
    var img2d_data;
    var img2d_w = 50;
    
    var gl;
    var input_array;

    var TRACK_AGENT = true;
    var mitems = {}; // mesh items
    var frame = 0;
    var num_sensors = 9;
    
    //------------------------------------------------------------------------------------
    //
    //
    function get_input_array() {
        return input_array;
    }
    
    function do_all(agent, items, walls) {
        $.getScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/r73/three.min.js", function(){
            rl3d.agent = agent;
            rl3d.items = items;
            rl3d.walls = walls;
            
            init_modelviewer();
            
            // ---------------------------------------------------------------------------
            // http://stackoverflow.com/questions/6171932/webgl-reading-pixel-data-from-render-buffer            
            //
            // be careful - allocate memory only once
            pixels = new Uint8Array(4 * container_width); 
            pixels2d = new Uint8Array(4 * container_width*10);
            
            // ---------------------------------------------------------------------------
            // Set up webGL
            //
            gl = renderer.context;
            var rttTexture = gl.createTexture();
            var framebuffer = rttTexture.__webglFramebuffer;
            gl.viewport(0, 0, container_width, container_height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            console.log("pixLL", pixels.length);
            
            // ---------------------------------------------------------------------------
            // Make a 2D view representing the agent's input_array
            //
            console.log($("#2dview"));
            var canvas2d = $("#2dview")[0];
            $('#2dview').attr({width:num_sensors*img2d_w,height:1});//.css({width:container_width+'px',height:10+'px'})‌​;
            $('#2dview').css({width:800,height:50,border:1,imageRendering:'pixelated'});//.css({width:container_width+'px',height:10+'px'})‌​; imageRendering:'pixelated'
            img2d_ctx = canvas2d.getContext('2d');
            img2d_data = img2d_ctx.createImageData(num_sensors*img2d_w, 1);
            
            // init input_array
            input_array = [];
            for (var i=0; i<num_sensors*3; i++) input_array.push(1);
            console.log("ARR0", input_array.length);
            
            animate_modelviewer();
        });
    }
    
    function init_modelviewer() {
        materials = {1: new THREE.MeshPhongMaterial({
                                    specular: '#FF5555', color: '#DD5555', emissive: '#4F0707', shininess: 100 
                                }),
                     2: new THREE.MeshPhongMaterial({
                                    specular: '#55FF55', color: '#55DD55', emissive: '#074F07', shininess: 100 
                                }),
                     wall: new THREE.MeshPhongMaterial({
                                    specular: '#000000', color: '#000000', emissive: '#000000', side: THREE.DoubleSide
                                }),
                    }
        container = $("#3dview");
        container_width = 800; //$(container).width();
        container_height = 400;//$(container).height();
        console.log(container_width, container_height);
        
        //----------------------------------------------------------------------------
        // Set up scene
        // camera, fov, aspect, near, far
        //
        scene = new THREE.Scene();
        
        //camera = new THREE.PerspectiveCamera( 80, container_width/container_height, .001, 2000);
        //camera.position.set(container_width/2, 300, container_height * 1.5);
        
        var ambient = new THREE.AmbientLight( 0x303030 );
        scene.add( ambient );
        
        var directionalLight = new THREE.DirectionalLight( 0xffeedd );
        directionalLight.position.set( 0, 100, 0 );
        directionalLight.castShadow = true;
        directionalLight.shadowCameraNear = 1;
        directionalLight.shadowCameraFar = 25000;
        directionalLight.shadowCameraFov = 500;
        scene.add( directionalLight );
        
        /*
        var light = new THREE.SpotLight( 0x8888FF, 2 );
        spot1 = light;
        light.position.set(240,100,200);
        light.target.position.set( 240, 0, 200 );
        light.shadowCameraNear = 0.01;
        light.shadowCameraFar = 10000;
        light.castShadow = true;
        light.shadowDarkness = 0.5;
        scene.add(spot1);
        */
   
        // -------------------------------------------------------------------------------
        // Floor
        //
        var pgeometry = new THREE.PlaneGeometry( container_width*1.4, container_height*1.4 );
        var pmaterial = new THREE.MeshPhongMaterial( {color: 0xeeeecc, side: THREE.DoubleSide} );
        var plane = new THREE.Mesh( pgeometry, pmaterial );
        plane.receiveShadow = true;
        plane.position.x = container_width/2;
        plane.position.z = container_height/2;
        plane.position.y = 0;
        plane.rotation.x = Math.PI/2;
        scene.add( plane );


        // -------------------------------------------------------------------------------
        // Add walls
        //
        var walls = rl3d.walls;
        for (var i=0; i<walls.length; i++) {            
            var c1 = new THREE.CubeGeometry( walls[i].p2.x - walls[i].p1.x + 1, 
                                             50, 
                                             walls[i].p2.y - walls[i].p1.y + 1 ); 
            //var c2 = new THREE.CubeGeometry( walls[i].p2.x - walls[i].p1.x + 0, 20, walls[i].p2.y - walls[i].p1.y + 0 );
            //c2.position.y = 90;
            //var c3 = new THREE.CubeGeometry( walls[i].p2.x - walls[i].p1.x + 1, 90, walls[i].p2.y - walls[i].p1.y + 1 ); 
            //c3.position.y = 110;
            //THREE.GeometryUtils.merge(c1,c2,c3);
            
            // move wall into position
            var cube = new THREE.Mesh(c1, materials['wall']);
            cube.castShadow = true;
            cube.receiveShadow = true;
            cube.position.x = (walls[i].p1.x + walls[i].p2.x) / 2;
            cube.position.y = 25;
            cube.position.z = (walls[i].p1.y + walls[i].p2.y) / 2;
            scene.add(cube)
        }
        
        // -------------------------------------------------------------------------------
        // Agent
        //
        rl3d.agent.prev_angle = rl3d.agent.angle;
        magent = new THREE.Mesh( 
            new THREE.CubeGeometry( 10, 5, 10),
            new THREE.MeshPhongMaterial({specular: '#6699FF', color: '#5566AA', emissive: '#223344'}) );
        
        magent.position.x = rl3d.agent.p.x;
        magent.position.y = 5;
        magent.position.z = rl3d.agent.p.y;
        scene.add(magent);
        
        
        //--------------------------------------------------------------------------
        // Do render 
        // antialias is from http://www.semayjohnston.com/example.html
        //
        if (window.WebGLRenderingContext) {
            console.log("Setting renderer: WebGL");
            renderer = new THREE.WebGLRenderer();
            renderer.antialias = true;
            renderer.shadowMap.enabled = true;              
        }
        else {
            console.log("Setting renderer: CANVAS");
            renderer = new THREE.CanvasRenderer();
        }
        renderer.setSize(container_width, container_height);
        
        $(container).append(renderer.domElement);
    }
    

    function animate_modelviewer() {
        requestAnimationFrame( animate_modelviewer );
        new_frame();
        
        renderer.clear();
        renderer.render( scene, camera );
        
        if (true) {
            //gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            //gl.bindFramebuffer(gl.FRAMEBUFFER, null); // ?
            gl.readPixels(0, container_height/2, container_width, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            //console.log("pix", pixels);
            //var n = Math.floor(container_width/20);
            var w = Math.floor(container_width/num_sensors)
            var off = Math.floor((container_width % num_sensors) / 2);
            console.log("w off", w, off);
            for (var i=0; i<num_sensors; i++) {
                input_array[i*3+0] = 0;
                input_array[i*3+1] = 0;
                input_array[i*3+2] = 0;
                var _start = off*4+w*i*4;
                for (var j=0; j<w; j++) {
                    input_array[i*3+0] += (pixels[_start+j*4+0]/255.) / w;
                    input_array[i*3+1] += (pixels[_start+j*4+1]/255.) / w;
                    input_array[i*3+2] += (pixels[_start+j*4+2]/255.) / w;
                }
                //n += container_width/10.; 
            }
            //console.log("ARR", input_array.length, input_array[input_array.length-1]);
            //console.log(input_array);
            
            // 2D sensors        
            for (var i=0; i<num_sensors; i++) {
                console.log("i", i, input_array[i*3+0], input_array[i*3+1], input_array[i*3+2]);
                for (var j=0; j<img2d_w; j++) {
                    img2d_data.data[i*4*img2d_w+j*4+0] = Math.floor(255*input_array[i*3+0]);
                    img2d_data.data[i*4*img2d_w+j*4+1] = Math.floor(255*input_array[i*3+1]);
                    img2d_data.data[i*4*img2d_w+j*4+2] = Math.floor(255*input_array[i*3+2]);
                    img2d_data.data[i*4*img2d_w+j*4+3] = 255;
                }
            }
            img2d_ctx.putImageData(img2d_data, 0, 0);
        }
    }
    
    
    function fake_data() {
        var agent = {};
        agent.p = {};
        agent.p.x = 250;
        agent.p.y = 200;
        agent.angle = 1;
        
        var items = [];
        for (var i=0; i<100; i++) {
          var it = {};
          it.p = {};
          it.p.x = Math.random()*500;
          it.p.y = Math.random()*400;
          it.type = Math.random() < .5 ? 1 : 2;;
          it.rad = 10;
          items.push(it);
        }
        
        return [agent, items]; 
    }
    

    function _toid(item) {
        return '' + item.type + item.p.x + item.p.y;
    }
    
    function new_frame() {
        // -------------------------------------------------------------------------------
        // move stuff, replace missing items
        //
        if (frame == 0 || TRACK_AGENT != rl3d.TRACK_AGENT) {
            TRACK_AGENT = rl3d.TRACK_AGENT;
            camera = new THREE.PerspectiveCamera( 80, container_width/container_height, .001, 2000);
            camera.position.set(container_width/2, 300, container_height * 1.5);
            
            if (TRACK_AGENT === false) {
                camera.lookAt(new THREE.Vector3(container_width/2, 0, container_height/2));
            }
        }
        
        if (TRACK_AGENT) {
            camera.position.y = rl3d.items[0].rad;        
            camera.position.x = rl3d.agent.p.x;
            camera.position.z = rl3d.agent.p.y;
            
            var av = 100; // max amount to rotate per frame -- up 
            var _dist = rl3d.agent.angle - rl3d.agent.prev_angle;
            if (_dist > Math.PI) _dist = _dist - 2*Math.PI;
            if (_dist < -Math.PI) _dist = _dist + 2*Math.PI;            
            
            if (_dist > 0) rl3d.agent.vangle = Math.min(rl3d.agent.angle, rl3d.agent.prev_angle + av);
            else rl3d.agent.vangle = Math.max(rl3d.agent.angle, rl3d.agent.prev_angle - av);
            
            camera.rotation.y = Math.PI + rl3d.agent.vangle;
            rl3d.agent.prev_angle = rl3d.agent.vangle;
        }        

        // -------------------------------------------------------------------------------      
        // Iterate frame, update positions
        //
        
        frame += 1;
        
        magent.position.x = rl3d.agent.p.x;
        magent.position.z = rl3d.agent.p.y;
        
        for (var i=0; i<rl3d.items.length; i++) {
          if (!mitems[_toid(rl3d.items[i])]) {
              var sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), materials[rl3d.items[i].type]);
              sphere.castShadow = true;
              sphere.position.x = rl3d.items[i].p.x;
              sphere.position.y = rl3d.items[i].rad;
              sphere.position.z = rl3d.items[i].p.y;
              sphere.present = frame;
              mitems[_toid(rl3d.items[i])] = sphere;
              scene.add(sphere);
          }
          else {
              mitems[_toid(rl3d.items[i])].present = frame;
          }
        }
        
        for (var sid in mitems) {
          if (mitems[sid].present != frame) {
            scene.remove( mitems[sid] );
            delete mitems[sid];
          }
        }      
    }
    
    // -----------------------------------------------------------------------------------
    // Expose some methods
    //
    rl3d.TRACK_AGENT = TRACK_AGENT;
    rl3d.do_all = do_all;
    rl3d.get_input_array = get_input_array;
})(rl3d);
