  var canvas, ctx;
  var vcanvas, vctx;
  
    // A 2D vector utility
    var Vec = function(x, y) {
      this.x = x;
      this.y = y;
    }
    Vec.prototype = {
      
      // utilities
      dist_from: function(v) { return Math.sqrt(Math.pow(this.x-v.x,2) + Math.pow(this.y-v.y,2)); },
      length: function() { return Math.sqrt(Math.pow(this.x,2) + Math.pow(this.y,2)); },
      
      // new vector returning operations
      add: function(v) { return new Vec(this.x + v.x, this.y + v.y); },
      sub: function(v) { return new Vec(this.x - v.x, this.y - v.y); },
      rotate: function(a) {  // CLOCKWISE
        return new Vec(this.x * Math.cos(a) + this.y * Math.sin(a),
                       -this.x * Math.sin(a) + this.y * Math.cos(a));
      },
      
      // in place operations
      scale: function(s) { this.x *= s; this.y *= s; },
      normalize: function() { var d = this.length(); this.scale(1.0/d); }
    }
    
    // line intersection helper function: does line segment (p1,p2) intersect segment (p3,p4) ?
    var line_intersect = function(p1,p2,p3,p4) {
      var denom = (p4.y-p3.y)*(p2.x-p1.x)-(p4.x-p3.x)*(p2.y-p1.y);
      if(denom===0.0) { return false; } // parallel lines
      var ua = ((p4.x-p3.x)*(p1.y-p3.y)-(p4.y-p3.y)*(p1.x-p3.x))/denom;
      var ub = ((p2.x-p1.x)*(p1.y-p3.y)-(p2.y-p1.y)*(p1.x-p3.x))/denom;
      if(ua>0.0&&ua<1.0&&ub>0.0&&ub<1.0) {
        var up = new Vec(p1.x+ua*(p2.x-p1.x), p1.y+ua*(p2.y-p1.y));
        return {ua:ua, ub:ub, up:up}; // up is intersection point
      }
      return false;
    }
    
    var line_point_intersect = function(p1,p2,p0,rad) {
      var v = new Vec(p2.y-p1.y,-(p2.x-p1.x)); // perpendicular vector
      var d = Math.abs((p2.x-p1.x)*(p1.y-p0.y)-(p1.x-p0.x)*(p2.y-p1.y));
      d = d / v.length();
      if(d > rad) { return false; }
      
      v.normalize();
      v.scale(d);
      var up = p0.add(v);
      if(Math.abs(p2.x-p1.x)>Math.abs(p2.y-p1.y)) {
        var ua = (up.x - p1.x) / (p2.x - p1.x);
      } else {
        var ua = (up.y - p1.y) / (p2.y - p1.y);
      }
      if(ua>0.0&&ua<1.0) {
        return {ua:ua, up:up};
      }
      return false;
    }
    
    // Wall is made up of two points
    var Wall = function(p1, p2) {
      this.p1 = p1;
      this.p2 = p2;
    }
    
    // World object contains many agents and walls and food and stuff
    var util_add_box = function(lst, x, y, w, h) {
      lst.push(new Wall(new Vec(x,y), new Vec(x+w,y)));
      lst.push(new Wall(new Vec(x+w,y), new Vec(x+w,y+h)));
      lst.push(new Wall(new Vec(x+w,y+h), new Vec(x,y+h)));
      lst.push(new Wall(new Vec(x,y+h), new Vec(x,y)));
    }
    
    // item is circle thing on the floor that agent can interact with (see or eat, etc)
    var Item = function(x, y, type) {
      this.p = new Vec(x, y); // position
      this.type = type;
      this.rad = 10; // default radius
      this.age = 0;
      this.cleanup_ = false;
      this.alive = 1;
    }
    
    var World = function() {
      this.agents = [];
      this.W = canvas.width;
      this.H = canvas.height;
      
      this.clock = 0;
      
      // set up walls in the world
      this.walls = []; 
      var pad = 10;
      util_add_box(this.walls, pad, pad, this.W-pad*2, this.H-pad*2);
      /*
      util_add_box(this.walls, 100, 100, 200, 300); // inner walls
      this.walls.pop();
      util_add_box(this.walls, 400, 100, 200, 300);
      this.walls.pop();
      */
      
      //
      // Set up track
      //
      this.items = [];
      this.ot = [];
      for(var k=0;k<40;k++) {
        var val = Math.PI * 2 * (k / 40.0);
        var _x = this.W/2 + this.W/3 * Math.sin(val)
        var _y = this.H/2 + this.H/3 * Math.cos(val)
        
        var x = _x;// + .1*convnetjs.randf(20, this.W-20);
        var y = _y;// + .1*convnetjs.randf(20, this.H-20);
        var t = 1; //convnetjs.randi(1, 3); // food or poison (1 and 2)
        var it = new Item(x, y, t);
        this.items.push(it);
      }

      //
      // Set up barrier
      //
      for(var k=0;k<80;k++) {
        var val = Math.PI * 2 * (k / 80.0);
        if (Math.random() < .5) {
            var _x = this.W/2 + this.W/2 * Math.sin(val)
            var _y = this.H/2 + this.H/2 * Math.cos(val)
        }
        else {
            var _x = this.W/2 + this.W/5 * Math.sin(val)
            var _y = this.H/2 + this.H/5 * Math.cos(val)
        }        
        var x = _x + .01*convnetjs.randf(20, this.W-20);
        var y = _y + .01*convnetjs.randf(20, this.H-20);
        var t = 2; //convnetjs.randi(1, 3); // food or poison (1 and 2)
        var it = new Item(x, y, t);
        this.items.push(it);
      }
    }
    
    World.prototype = {      
      // helper function to get closest colliding walls/items
      stuff_collide_: function(p1, p2, check_walls, check_items) {
        var minres = false;
        
        // collide with walls
        if(check_walls) {
          for(var i=0,n=this.walls.length;i<n;i++) {
            var wall = this.walls[i];
            var res = line_intersect(p1, p2, wall.p1, wall.p2);
            if(res) {
              res.type = 0; // 0 is wall
              if(!minres) { minres=res; }
              else {
                // check if its closer
                if(res.ua < minres.ua) {
                  // if yes replace it
                  minres = res;
                }
              }
            }
          }
        }
        
        // collide with items
        if(check_items) {
          for(var i=0,n=this.items.length;i<n;i++) {
            var it = this.items[i];
            if (it.alive != 1) continue;
            
            var res = line_point_intersect(p1, p2, it.p, it.rad);
            if(res) {
              res.type = it.type; // store type of item
              if(!minres) { minres=res; }
              else { if(res.ua < minres.ua) { minres = res; }
              }
            }
          }
        }
        
        return minres;
      },
      tick: function() {
        // tick the environment
        this.clock++;
        
        // fix input to all agents based on environment
        // process eyes
        this.collpoints = [];
        for(var i=0,n=this.agents.length;i<n;i++) {
          var a = this.agents[i];
          for(var ei=0,ne=a.eyes.length;ei<ne;ei++) {
            var e = a.eyes[ei];
            // we have a line from p to p->eyep
            var eyep = new Vec(a.p.x + e.max_range * Math.sin(a.angle + e.angle),
                               a.p.y + e.max_range * Math.cos(a.angle + e.angle));
            var res = this.stuff_collide_(a.p, eyep, true, true);
            if(res) {
              // eye collided with wall
              e.sensed_proximity = res.up.dist_from(a.p);
              e.sensed_type = res.type;
            } else {
              e.sensed_proximity = e.max_range;
              e.sensed_type = -1;
            }
          }
        }
        
        // let the agents behave in the world based on their input
        for(var i=0,n=this.agents.length;i<n;i++) {
          this.agents[i].forward();
        }
        
        // apply outputs of agents on evironment
        for(var i=0,n=this.agents.length;i<n;i++) {
          var a = this.agents[i];
          a.op = new Vec(a.p.x, a.p.y); // back up old position
          a.oangle = a.angle; // and angle
          //console.log("angle", a.angle);
          
          // Direction I am traveling
          
          //a.angle = -Math.PI/4;
          
          // steer the agent according to outputs of wheel velocities
          /*
          var v = new Vec(0, a.rad / 2.0);
          v = v.rotate(a.angle + Math.PI/2);
          a.p = a.p.add(v); // positions of wheel 1 and 2
          */
          //var w2p = a.p.sub(v);
          //var vv = a.p.sub(w2p);
          //vv = vv.rotate(-a.rot1);
          //var vv2 = a.p.sub(w1p);
          
          //vv2 = vv2.rotate(a.rot2);
          //var np = w2p.add(vv);
          //np.scale(0.5);
          //var np2 = w1p.add(vv2);
          //np2.scale(0.5);
          //a.p = np.add(np2);
          
          // Rotate myself
          a.angle -= a.rot1*.1;
          if(a.angle<0)a.angle+=2*Math.PI;
          if(a.angle>2*Math.PI)a.angle-=2*Math.PI;
          
          a.p.x += (a.speed+.01)*Math.sin(a.angle);
          a.p.y += (a.speed+.01)*Math.cos(a.angle);
          
          // agent is trying to move from p to op. Check walls
          // check_walls=true, check_items=false
          var res = this.stuff_collide_(a.op, a.p, true, false);
          if(res) {
            // wall collision! reset position
            console.log("WALL!");
            a.p = a.op;
          }
          
          // handle boundary conditions
          if(a.p.x<0)a.p.x=0;
          if(a.p.x>this.W)a.p.x=this.W;
          if(a.p.y<0)a.p.y=0;
          if(a.p.y>this.H)a.p.y=this.H;
        }
        
        // tick all items
        var update_items = true;
        for(var i=0,n=this.items.length;i<n;i++) {
          var it = this.items[i];
          if (it.alive !== 1) continue;
          
          it.age += 1;
          
          // see if some agent gets lunch
          for(var j=0,m=this.agents.length;j<m;j++) {
            var a = this.agents[j];
            var d = a.p.dist_from(it.p);
            if(d < it.rad + a.rad) {
              
              // wait lets just make sure that this isn't through a wall
              var rescheck = this.stuff_collide_(a.p, it.p, true, false);
              if(!rescheck) { 
                // ding! nom nom nom
                if(it.type === 1) console.log("YUM"); a.digestion_signal += 5.0; // mmm delicious apple
                if(it.type === 2) console.log("YUCK"); a.digestion_signal += -6.0; // ewww poison
                it.cleanup_ = true;
                it.alive = -100;
                it.rad = 0;
                update_items = true;
                break; // break out of loop, item was consumed
              }
            }
          }
          
          //
          // Track: do not remove old items
          //
          /*
          if(it.age > 5000 && this.clock % 100 === 0 && convnetjs.randf(0,1)<0.1) {
            it.cleanup_ = true; // replace this one, has been around too long
            update_items = true;
          }
          */
        }
        
        if(update_items) {
          for(var i=0,n=this.items.length;i<n;i++) {
            var it = this.items[i];
            if(it.alive < 1) { // not alive
              it.alive += 1;
            }
            else {
              it.alive = 1;
              it.rad = 10;
            }
          }
        }
        
        //
        // Replace old
        //
        /*
        var remvals = []
        for (var i=0; i<this.ot.length; i++) {
            this.ot[i].renew = this.ot[i].renew + 1;
            console.log("renew", i, this.ot[i].renew);
            if (this.ot[i].renew > 5) {
              remvals.push(i);
              this.ot[i].cleanup_ = false;
              this.items.push(this.ot[i]);
            }
        }
        for (var i=0; i<remvals.length; i++) {
          this.ot.splice(remvals[0],1);
        }
        */
        
        /*
        if(this.items.length < 120 && this.clock % 10 === 0 && convnetjs.randf(0,1)<0.25) {
          console.log(this.ot, this.ot[0].p, this.ot[0].type);
          var newitx = this.ot[0].p.x; //convnetjs.randf(20, this.W-20);
          var newity = this.ot[0].p.x; //convnetjs.randf(20, this.H-20);
          var newitt = this.ot[0].type; //convnetjs.randi(1, 3); // food or poison (1 and 2)
          var newit = new Item(newitx, newity, newitt);
          this.items.push(newit);
        }
        */
        
        
        // agents are given the opportunity to learn based on feedback of their action on environment
        for(var i=0,n=this.agents.length;i<n;i++) {
          this.agents[i].backward();
        }
      }
    }
    
    // Eye sensor has a maximum range and senses walls
    var Eye = function(angle) {
      this.angle = angle; // angle relative to agent its on
      this.max_range = 85;
      this.sensed_proximity = 85; // what the eye is seeing. will be set in world.tick()
      this.sensed_type = -1; // what does the eye see?
    }
    
    // A single agent
    var Agent = function() {
    
      // positional information
      this.p = new Vec(canvas.width/2, canvas.height/2);
      this.op = this.p; // old position
      this.angle = 0; // direction facing
      
      this.actions = [];
      this.actions.push([1,0]);
      this.actions.push([0,1]);
      this.actions.push([0,-1]);
      
      // properties
      this.rad = 10;
      this.eyes = [];
      for(var k=0;k<9;k++) { this.eyes.push(new Eye((k-3)*0.25)); }
      
      // braaain
      //this.brain = new deepqlearn.Brain(this.eyes.length * 3, this.actions.length);
      var spec = document.getElementById('qspec').value;
      eval(spec);
      this.brain = brain;
      
      this.reward_bonus = 0.0;
      this.digestion_signal = 0.0;
      
      // outputs on world
      this.rot1 = 0.0; // rotation speed of 1st wheel
      this.speed = 0.0; // rotation speed of 2nd wheel
      
      this.prevactionix = -1;
    }
    Agent.prototype = {
      forward: function() {
        // in forward pass the agent simply behaves in the environment
        // create input to brain
        var num_eyes = this.eyes.length;
        var input_array = new Array(num_eyes * 3);
        for(var i=0;i<num_eyes;i++) {
          var e = this.eyes[i];
          input_array[i*3] = 1.0;
          input_array[i*3+1] = 1.0;
          input_array[i*3+2] = 1.0;
          if(e.sensed_type !== -1) {
            // sensed_type is 0 for wall, 1 for food and 2 for poison.
            // lets do a 1-of-k encoding into the input array
            input_array[i*3 + e.sensed_type] = e.sensed_proximity/e.max_range; // normalize to [0,1]
          }
        }
        
        // get action from brain
        var actionix = this.brain.forward(input_array);
        var action = this.actions[actionix];
        this.actionix = actionix; //back this up
        
        // demultiplex into behavior variables
        this.rot1 = action[1];
        this.speed = action[0];
        
        //this.rot1 = 0;
        //this.rot2 = 0;
      },
      backward: function() {
        // in backward pass agent learns.
        // compute reward 
        var proximity_reward = 0.0;
        var num_eyes = this.eyes.length;
        for(var i=0;i<num_eyes;i++) {
          var e = this.eyes[i];
          // agents dont like to see walls, especially up close
          proximity_reward += e.sensed_type === 0 ? e.sensed_proximity/e.max_range : 1.0;
        }
        proximity_reward = proximity_reward/num_eyes;
        proximity_reward = Math.min(1.0, proximity_reward * 2);
        
        
        var near_red_reward = 0.0;
        for(var i=0;i<num_eyes;i++) {
          var e = this.eyes[i];
          // agents dont like to see walls, especially up close
          if (e.sensed_type === 1) { near_red_reward += .05/num_eyes; }
        }
        
        
        // agents like to go straight forward
        var forward_reward = 0.0;
        if(this.actionix === 0 && proximity_reward > 0.75) forward_reward = 0.1 * proximity_reward;
        
        // agents like to eat good things
        var digestion_reward = this.digestion_signal;
        this.digestion_signal = 0.0;
        
        var reward = proximity_reward + forward_reward + digestion_reward + near_red_reward;
        
        // pass to brain for learning
        this.brain.backward(reward);
      }
    }
    
    function draw_net() {
      if(simspeed <=1) {
        // we will always draw at these speeds
      } else {
        if(w.clock % 50 !== 0) return;  // do this sparingly
      }
      
      var canvas = document.getElementById("net_canvas");
      var ctx = canvas.getContext("2d");
      var W = canvas.width;
      var H = canvas.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var L = w.agents[0].brain.value_net.layers;
      var dx = (W - 50)/L.length;
      var x = 10;
      var y = 40;
      ctx.font="12px Verdana";
      ctx.fillStyle = "rgb(0,0,0)";
      ctx.fillText("Value Function Approximating Neural Network:", 10, 14);
      for(var k=0;k<L.length;k++) {
        if(typeof(L[k].out_act)==='undefined') continue; // maybe not yet ready
        var kw = L[k].out_act.w;
        var n = kw.length;
        var dy = (H-50)/n;
        ctx.fillStyle = "rgb(0,0,0)";
        ctx.fillText(L[k].layer_type + "(" + n + ")", x, 35);
        for(var q=0;q<n;q++) {
          var v = Math.floor(kw[q]*100);
          if(v >= 0) ctx.fillStyle = "rgb(0,0," + v + ")";
          if(v < 0) ctx.fillStyle = "rgb(" + (-v) + ",0,0)";
          ctx.fillRect(x,y,10,10);
          y += 12;
          if(y>H-25) { y = 40; x += 12};
        }
        x += 50;
        y = 40;
      }
    }
    
    var reward_graph = new cnnvis.Graph();
    function draw_stats() {
      var canvas = document.getElementById("vis_canvas");
      var ctx = canvas.getContext("2d");
      var W = canvas.width;
      var H = canvas.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var a = w.agents[0];
      var b = a.brain;
      var netin = b.last_input_array;
      ctx.strokeStyle = "rgb(0,0,0)";
      //ctx.font="12px Verdana";
      //ctx.fillText("Current state:",10,10);
      ctx.lineWidth = 10;
      ctx.beginPath();
      for(var k=0,n=netin.length;k<n;k++) {
        ctx.moveTo(10+k*12, 120);
        ctx.lineTo(10+k*12, 120 - netin[k] * 100);
      }
      ctx.stroke();
      
      if(w.clock % 200 === 0) {
        reward_graph.add(w.clock/200, b.average_reward_window.get_average());
        var gcanvas = document.getElementById("graph_canvas");
        reward_graph.drawSelf(gcanvas);
      }
    }
    
    // Draw everything
    function draw() {  
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 1;
      var agents = w.agents;
      
      // draw walls in environment
      ctx.strokeStyle = "rgb(0,0,0)";
      ctx.beginPath();
      for(var i=0,n=w.walls.length;i<n;i++) {
        var q = w.walls[i];
        ctx.moveTo(q.p1.x, q.p1.y);
        ctx.lineTo(q.p2.x, q.p2.y);
      }
      ctx.stroke();
  
      // draw agents
      // color agent based on reward it is experiencing at the moment
      var r = Math.floor(agents[0].brain.latest_reward * 200);
      if(r>255)r=255;if(r<0)r=0;
      ctx.fillStyle = "rgb(" + r + ", 150, 150)";
      ctx.strokeStyle = "rgb(0,0,0)";
      for(var i=0,n=agents.length;i<n;i++) {
        var a = agents[i];
        
        // draw agents body
        ctx.beginPath();
        ctx.arc(a.op.x, a.op.y, a.rad, 0, Math.PI*2, true); 
        ctx.fill();
        ctx.stroke();
        
        // draw agents sight
        for(var ei=0,ne=a.eyes.length;ei<ne;ei++) {
          var e = a.eyes[ei];
          var sr = e.sensed_proximity;
          if(e.sensed_type === -1 || e.sensed_type === 0) { 
            ctx.strokeStyle = "rgb(0,0,0)"; // wall or nothing
          }
          if(e.sensed_type === 0) { ctx.strokeStyle = "rgb(0,0,250)"; } // wall
          if(e.sensed_type === 1) { ctx.strokeStyle = "rgb(255,150,150)"; } // apples
          if(e.sensed_type === 2) { ctx.strokeStyle = "rgb(150,255,150)"; } // poison
          ctx.beginPath();
          ctx.moveTo(a.op.x, a.op.y);
          ctx.lineTo(a.op.x + sr * Math.sin(a.oangle + e.angle),
                     a.op.y + sr * Math.cos(a.oangle + e.angle));
          ctx.stroke();
        }
      }
      
      // draw items
      ctx.strokeStyle = "rgb(0,0,0)";
      for(var i=0,n=w.items.length;i<n;i++) {
        var it = w.items[i];
        if(it.type === 1) ctx.fillStyle = "rgb(255, 150, 150)";
        if(it.type === 2) ctx.fillStyle = "rgb(150, 255, 150)";
        ctx.beginPath();
        ctx.arc(it.p.x, it.p.y, it.rad, 0, Math.PI*2, true); 
        ctx.fill();
        ctx.stroke();
      }
      
      // myview
      /*
      var two_pi = 2*Math.PI;
      var _fixa = function(angle) {
        return (angle < 0 ? angle+two_pi : angle) % two_pi;
      }
      var _ang = function(angle1, angle2) {
        var val1 = angle2 - angle1; // normal
        var val2 = angle2 - angle1 + two_pi; // angle2 = 0.1, angl1=6
        var val3 = angle2 - angle1 - two_pi; // angle2 = 6, angle1=0.1
        
        var temp = Math.abs(val1) < Math.abs(val2) ? val1 : val2;
        return Math.abs(temp) < Math.abs(val3) ? temp : val3;
      }
      
      var colormap = {0:"rgb(0,0,100)", 1:"rgb(2000,0,0)", 2:"rgb(0,200,0)"}
      vctx.clearRect(0, 0, vcanvas.width, vcanvas.height);
      for(var i=0; i<w.agents.length;i++) {
        var a = w.agents[i];
        
        for(var j=0; j<w.items.length; j++) {
          var it = w.items[j];
          var d = a.p.dist_from(it.p);
          var _fov = 1; // radians
          
          // Math.PI/2 just to match a.angle (0 is down)
          var da = _fixa(Math.PI/2 + Math.atan2(-(it.p.y - a.p.y), it.p.x - a.p.x));
          
          if (da > 2*Math.PI) { throw "angle assertion fail"; }
          
          console.log("da", da, "a.angle", a.angle, "--", _fixa(a.angle+_fov), _fixa(a.angle-_fov));
          console.log("da y", it.p.y, a.p.y, "x", it.p.x, a.p.x);
          
          // example
          // da is at 0.1 or 5.9
          // angle = 6
          // angle-fov = 5
          // anglb+fov = 1
          
          if (d < 500 && it.type !== 0) {
            var v_ang = _ang(da, a.angle);
            if (v_ang < _fov) {
              console.log("inside!");
              // draw circle
              console.log("draw circle", it.type);
              vctx.fillStyle = colormap[it.type];
              vctx.beginPath();
              vctx.arc(vcanvas.width/2 + (v_ang/_fov)*vcanvas.width/2, 50, 800/d, 0, Math.PI*2, true); 
              vctx.fill();
              vctx.stroke();
            }
          }
          // this.item.p.x, this.item.p.y
        }
      }
      */

      w.agents[0].brain.visSelf(document.getElementById('brain_info_div'));
    }
    
    // Tick the world
    function tick() {
      w.tick();
      if(!skipdraw || w.clock % 50 === 0) {
        draw();
        draw_stats();
        draw_net();
      }
    }
    
    var simspeed = 2;
    function goveryfast() {
      window.clearInterval(current_interval_id);
      current_interval_id = setInterval(tick, 0);
      skipdraw = true;
      simspeed = 3;
    }
    function gofast() {
      window.clearInterval(current_interval_id);
      current_interval_id = setInterval(tick, 0);
      skipdraw = false;
      simspeed = 2;
    }
    function gonormal() {
      window.clearInterval(current_interval_id);
      current_interval_id = setInterval(tick, 30);
      skipdraw = false;
      simspeed = 1;
    }
    function goslow() {
      window.clearInterval(current_interval_id);
      current_interval_id = setInterval(tick, 200);
      skipdraw = false;
      simspeed = 0;
    }
    function goveryslow() {
      window.clearInterval(current_interval_id);
      current_interval_id = setInterval(tick, 2000);
      skipdraw = false;
      simspeed = 0;
    }
    
    function savenet() {
      var j = w.agents[0].brain.value_net.toJSON();
      var t = JSON.stringify(j);
      document.getElementById('tt').value = t;
    }
    
    function loadnet() {
      var t = document.getElementById('tt').value;
      var j = JSON.parse(t);
      w.agents[0].brain.value_net.fromJSON(j);
      stoplearn(); // also stop learning
      gonormal();
    }
    
    function startlearn() {
      w.agents[0].brain.learning = true;
    }
    function stoplearn() {
      w.agents[0].brain.learning = false;
    }
    
    function reload() {
      w.agents = [new Agent()]; // this should simply work. I think... ;\
      reward_graph = new cnnvis.Graph(); // reinit
    }
    
    var w; // global world object
    var current_interval_id;
    var skipdraw = false;
    function start() {
      canvas = document.getElementById("canvas");
      ctx = canvas.getContext("2d");
      
      w = new World();
      w.agents = [new Agent()];
    
      // Draw myview
      //vcanvas = document.getElementById("3dview");
      //vctx = vcanvas.getContext("2d");
      //vctx.clearRect(0, 0, vcanvas.width, vcanvas.height);
      console.log("w", w.agents[0], w.items);
      rl3d.do_all(w.agents[0], w.items, w.W, w.H);
          
      goslow();
    }