<?php
/**
 * AI gateway (ADR 0013, 0015): the agent loop runs in Auvyx Studio; this module only forwards a conversation to the
 * configured provider with the site's key, so the key never reaches the browser. Tool definitions and tool results are
 * forwarded; streamed tool-call fragments are assembled and emitted as `{"tool":...}` events.
 * Providers: any OpenAI-compatible API (OpenAI, OpenRouter, xAI, Ollama, LM Studio) and Anthropic.
 * The key is stored encrypted (libsodium; key from AUVYX_AI_KEY in wp-config, else the auth salt).
 * AUVYX_AI_API_KEY in wp-config overrides the stored key.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Ai;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\Studio\Studio;

defined( 'ABSPATH' ) || exit;

final class Ai implements Module {

	const OPTION = 'auvyx_builder_ai';

	const PROVIDERS = array( 'openai', 'anthropic' );

	/**
	 * Providers people pick by name (docs/editions.md: AI with any provider, in every edition): the API each speaks, its
	 * address, and model ids to start from (the field takes any).
	 */
	const PRESETS = array(
		'openai'     => array( 'OpenAI', 'openai', 'https://api.openai.com/v1', array( 'gpt-5', 'gpt-5-mini' ) ),
		'anthropic'  => array( 'Anthropic (Claude)', 'anthropic', '', array( 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5' ) ),
		'gemini'     => array( 'Google Gemini', 'openai', 'https://generativelanguage.googleapis.com/v1beta/openai', array( 'gemini-2.5-pro', 'gemini-2.5-flash' ) ),
		'openrouter' => array( 'OpenRouter (any model)', 'openai', 'https://openrouter.ai/api/v1', array( 'anthropic/claude-sonnet-4.5', 'openai/gpt-5', 'google/gemini-2.5-pro' ) ),
		'xai'        => array( 'xAI (Grok)', 'openai', 'https://api.x.ai/v1', array( 'grok-4' ) ),
		'deepseek'   => array( 'DeepSeek', 'openai', 'https://api.deepseek.com/v1', array( 'deepseek-chat' ) ),
		'groq'       => array( 'Groq', 'openai', 'https://api.groq.com/openai/v1', array( 'llama-3.3-70b-versatile' ) ),
		'mistral'    => array( 'Mistral', 'openai', 'https://api.mistral.ai/v1', array( 'mistral-large-latest' ) ),
		'ollama'     => array( 'Ollama (on your server)', 'openai', 'http://localhost:11434/v1', array( 'llama3.1', 'qwen2.5' ) ),
		'lmstudio'   => array( 'LM Studio (on your server)', 'openai', 'http://localhost:1234/v1', array() ),
		'custom'     => array( 'Another OpenAI-compatible API', 'openai', '', array() ),
	);

	public function id(): string {
		return 'ai';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		// Your own provider and key, in every edition: the only way the AI agent runs (Auvyx Cloud runs no agent).
		add_action( 'auvyx_builder_settings_fields', array( $this, 'settings_fields' ), 30 );
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
	}

	// ---- settings -----------------------------------------------------------------------

	/**
	 * @return array{preset: string, provider: string, base_url: string, model: string, key: string}
	 */
	public static function settings(): array {
		$saved    = get_option( self::OPTION, array() );
		$saved    = is_array( $saved ) ? $saved : array();
		$provider = in_array( $saved['provider'] ?? '', self::PROVIDERS, true ) ? $saved['provider'] : 'openai';
		return array(
			'preset'   => isset( self::PRESETS[ $saved['preset'] ?? '' ] ) ? (string) $saved['preset'] : self::preset_of( $provider, (string) ( $saved['base_url'] ?? 'https://openrouter.ai/api/v1' ) ),
			'provider' => $provider,
			'base_url' => isset( $saved['base_url'] ) ? (string) $saved['base_url'] : 'https://openrouter.ai/api/v1',
			'model'    => isset( $saved['model'] ) ? (string) $saved['model'] : 'anthropic/claude-sonnet-4.5',
			'key'      => isset( $saved['key'] ) ? (string) $saved['key'] : '',
		);
	}

	/** The preset a saved provider and address belong to (settings saved before presets existed). */
	public static function preset_of( string $provider, string $base_url ): string {
		if ( 'anthropic' === $provider ) {
			return 'anthropic';
		}
		foreach ( self::PRESETS as $id => $preset ) {
			if ( '' !== $preset[2] && untrailingslashit( $base_url ) === $preset[2] ) {
				return $id;
			}
		}
		return 'custom';
	}

	/** The API key in clear, or '' when none is configured. */
	private static function api_key(): string {
		if ( defined( 'AUVYX_AI_API_KEY' ) && '' !== (string) AUVYX_AI_API_KEY ) {
			return (string) AUVYX_AI_API_KEY;
		}
		$stored = self::settings()['key'];
		return '' === $stored ? '' : self::decrypt( $stored );
	}

	public static function configured(): bool {
		return '' !== self::api_key() && '' !== self::settings()['model'];
	}

	/**
	 * What Auvyx Studio may know (never the key).
	 *
	 * @return array{configured: bool, model: string, settingsUrl: string}
	 */
	public static function public_config(): array {
		return array(
			'configured'  => self::configured(),
			'model'       => self::settings()['model'],
			'settingsUrl' => current_user_can( 'manage_options' ) ? admin_url( 'admin.php?page=' . Studio::MENU . '-settings' ) : '',
		);
	}

	private static function secret(): string {
		$material = defined( 'AUVYX_AI_KEY' ) ? (string) AUVYX_AI_KEY : wp_salt( 'auth' );
		return sodium_crypto_generichash( $material, '', SODIUM_CRYPTO_SECRETBOX_KEYBYTES );
	}

	public static function encrypt( string $plain ): string {
		$nonce = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		return base64_encode( $nonce . sodium_crypto_secretbox( $plain, $nonce, self::secret() ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- binary ciphertext in an option.
	}

	public static function decrypt( string $stored ): string {
		$raw = base64_decode( $stored, true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- see encrypt().
		if ( false === $raw || strlen( $raw ) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ) {
			return '';
		}
		$plain = sodium_crypto_secretbox_open( substr( $raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ), substr( $raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ), self::secret() );
		return false === $plain ? '' : $plain;
	}

	public function register_settings(): void {
		register_setting(
			Studio::MENU,
			self::OPTION,
			array(
				'type'              => 'object',
				'sanitize_callback' => array( $this, 'sanitize' ),
			)
		);
	}

	/**
	 * A new key is encrypted; an empty key field keeps the stored one; "remove" clears it.
	 *
	 * @param mixed $value Submitted value.
	 * @return array<string, string>
	 */
	public function sanitize( $value ): array {
		$value    = is_array( $value ) ? $value : array();
		$current  = self::settings();
		$preset   = isset( self::PRESETS[ $value['preset'] ?? '' ] ) ? (string) $value['preset'] : '';
		$provider = '' !== $preset ? self::PRESETS[ $preset ][1] : ( in_array( $value['provider'] ?? '', self::PROVIDERS, true ) ? $value['provider'] : 'openai' );
		$key      = $current['key'];
		if ( ! empty( $value['remove_key'] ) ) {
			$key = '';
		} elseif ( isset( $value['api_key'] ) && '' !== trim( (string) $value['api_key'] ) ) {
			$key = self::encrypt( trim( (string) $value['api_key'] ) );
		} elseif ( ! isset( $value['api_key'] ) && isset( $value['key'] ) && is_string( $value['key'] ) ) {
			// WordPress sanitizes a new option twice: the second time it gets the first answer, the key already encrypted.
			$key = $value['key'];
		}
		$model    = sanitize_text_field( (string) ( $value['model'] ?? '' ) );
		$mismatch = self::mismatch( $provider, $model, '' !== $key ? self::decrypt( $key ) : '' );
		if ( '' !== $mismatch ) {
			if ( function_exists( 'add_settings_error' ) ) { // the settings screen (wp-admin) shows it
				add_settings_error( self::OPTION, 'auvyx_ai_mismatch', $mismatch );
			}
			$kept = get_option( self::OPTION, array() );
			return $kept ? $kept : array(); // keep what worked (or nothing) rather than a setup that fails every request
		}
		$base = esc_url_raw( trim( (string) ( $value['base_url'] ?? '' ) ) );
		if ( '' === $base && '' !== $preset ) {
			$base = self::PRESETS[ $preset ][2];
		}
		return array(
			'preset'   => '' !== $preset ? $preset : self::preset_of( $provider, $base ),
			'provider' => $provider,
			'base_url' => 'anthropic' === $provider ? '' : $base,
			'model'    => $model,
			'key'      => $key,
		);
	}

	/**
	 * Why a provider, model and key cannot work together ('' when they can): Anthropic's own API takes Anthropic keys and
	 * model ids, OpenRouter's (`sk-or-…`, `vendor/model`) go through the OpenAI-compatible provider. Same rule as
	 * EzyPlatform's `AiConfig.mismatch`.
	 *
	 * @param string $provider "openai" or "anthropic".
	 * @param string $model    Model id.
	 * @param string $key      Key in clear ('' when none).
	 */
	public static function mismatch( string $provider, string $model, string $key ): string {
		if ( 'anthropic' === $provider && ( 0 === strpos( $key, 'sk-or-' ) || false !== strpos( $model, '/' ) ) ) {
			return __( 'Anthropic\'s own API takes Anthropic keys (sk-ant-…) and model ids like claude-sonnet-4-5. This key or model belongs to OpenRouter: choose "OpenAI-compatible" with the base URL https://openrouter.ai/api/v1.', 'auvyx-builder' );
		}
		if ( 'openai' === $provider && 0 === strpos( $key, 'sk-ant-' ) ) {
			return __( 'This is an Anthropic key: choose the provider "Anthropic".', 'auvyx-builder' );
		}
		return '';
	}

	/** Auvyx Builder → Settings → AI assistant: the provider, its address, the model and the key; a test of the connection. */
	public function settings_fields(): void {
		$s    = self::settings();
		$name = self::OPTION;
		printf(
			'<section class="auvyx-card" id="auvyx-ai"><h2>%1$s <span class="auvyx-badge%2$s">%3$s</span></h2><p class="auvyx-muted">%4$s</p><table class="form-table" role="presentation">',
			esc_html__( 'AI agent: your own provider', 'auvyx-builder' ),
			self::configured() ? ' auvyx-badge--green' : '',
			esc_html( self::configured() ? __( 'Connected', 'auvyx-builder' ) : __( 'Not set up', 'auvyx-builder' ) ),
			esc_html__( 'The AI agent in Auvyx Editor needs this site\'s own AI provider key: pick the provider, paste your key and choose a model. Requests go from this site to the provider, at its prices; the key is stored encrypted and never sent to the browser. Auvyx Cloud does not run the agent.', 'auvyx-builder' )
		);
		echo '<tr><th><label for="auvyx-ai-preset">' . esc_html__( 'Provider', 'auvyx-builder' ) . '</label></th><td><select id="auvyx-ai-preset" name="' . esc_attr( $name ) . '[preset]">';
		foreach ( self::PRESETS as $id => $preset ) {
			printf(
				'<option value="%1$s" data-base="%2$s" data-models="%3$s" %4$s>%5$s</option>',
				esc_attr( $id ),
				esc_attr( $preset[2] ),
				esc_attr( implode( ',', $preset[3] ) ),
				selected( $s['preset'], $id, false ),
				esc_html( $preset[0] )
			);
		}
		echo '</select></td></tr>';
		printf(
			'<tr data-auvyx-ai-base><th><label for="auvyx-ai-base">%1$s</label></th><td><input id="auvyx-ai-base" class="regular-text" name="%2$s[base_url]" value="%3$s"><p class="description">%4$s</p></td></tr>',
			esc_html__( 'API address', 'auvyx-builder' ),
			esc_attr( $name ),
			esc_attr( $s['base_url'] ),
			esc_html__( 'Filled in for the provider you pick; change it for a proxy or your own server.', 'auvyx-builder' )
		);
		printf(
			'<tr><th><label for="auvyx-ai-model">%1$s</label></th><td><input id="auvyx-ai-model" class="regular-text" name="%2$s[model]" value="%3$s" list="auvyx-ai-models" autocomplete="off"><datalist id="auvyx-ai-models"></datalist><p class="description">%4$s</p></td></tr>',
			esc_html__( 'Model', 'auvyx-builder' ),
			esc_attr( $name ),
			esc_attr( $s['model'] ),
			esc_html__( 'Any model id your provider offers. A model that can call tools works best.', 'auvyx-builder' )
		);
		printf(
			'<tr><th><label for="auvyx-ai-key">%1$s</label></th><td><input id="auvyx-ai-key" class="regular-text" type="password" autocomplete="off" name="%2$s[api_key]" placeholder="%3$s"> <label><input type="checkbox" name="%2$s[remove_key]" value="1"> %4$s</label><p class="description">%5$s</p></td></tr>',
			esc_html__( 'API key', 'auvyx-builder' ),
			esc_attr( $name ),
			esc_attr( '' !== $s['key'] ? __( 'Saved (leave empty to keep)', 'auvyx-builder' ) : '' ),
			esc_html__( 'Remove', 'auvyx-builder' ),
			esc_html__( 'Local servers (Ollama, LM Studio) take any text here.', 'auvyx-builder' )
		);
		printf(
			'</table><p><button type="button" class="button" id="auvyx-ai-test" data-url="%1$s" data-nonce="%2$s">%3$s</button> <span id="auvyx-ai-test-result" class="auvyx-muted" role="status"></span></p></section>',
			esc_url( rest_url( 'auvyx/v1/ai/test' ) ),
			esc_attr( wp_create_nonce( 'wp_rest' ) ),
			esc_html__( 'Test the saved connection', 'auvyx-builder' )
		);
		// The provider fills in its address and model ids; the test asks the saved provider for one word.
		?>
		<script>
		( function () {
			var preset = document.getElementById( 'auvyx-ai-preset' ), base = document.getElementById( 'auvyx-ai-base' ), list = document.getElementById( 'auvyx-ai-models' );
			var model = document.getElementById( 'auvyx-ai-model' ), test = document.getElementById( 'auvyx-ai-test' ), out = document.getElementById( 'auvyx-ai-test-result' );
			function fill( first ) {
				var o = preset.options[ preset.selectedIndex ], models = ( o.dataset.models || '' ).split( ',' ).filter( Boolean );
				document.querySelector( '[data-auvyx-ai-base]' ).style.display = 'anthropic' === preset.value ? 'none' : '';
				if ( ! first ) { base.value = o.dataset.base || ''; model.value = models[ 0 ] || ''; }
				list.innerHTML = '';
				models.forEach( function ( m ) { var x = document.createElement( 'option' ); x.value = m; list.appendChild( x ); } );
			}
			preset.addEventListener( 'change', function () { fill( false ); } );
			fill( true );
			test.addEventListener( 'click', function () {
				out.textContent = '…';
				fetch( test.dataset.url, { method: 'POST', headers: { 'X-WP-Nonce': test.dataset.nonce } } )
					.then( function ( r ) { return r.json(); } )
					.then( function ( d ) { out.textContent = d.ok ? '✓ ' + d.model + ': ' + d.reply : '✗ ' + ( d.message || d.error || 'Failed' ); } )
					.catch( function ( e ) { out.textContent = '✗ ' + e.message; } );
			} );
		} )();
		</script>
		<?php
	}

	/**
	 * POST auvyx/v1/ai/test (administrators): one short completion from the saved provider, so a wrong key or model shows here
	 * rather than in the Studio.
	 *
	 * @return \WP_REST_Response
	 */
	public static function rest_test() {
		if ( ! self::configured() ) {
			return new \WP_REST_Response(
				array(
					'ok'      => false,
					'message' => __( 'Save a provider, a model and a key first.', 'auvyx-builder' ),
				)
			);
		}
		$result = self::complete( 'Answer with one word.', array( array( 'role' => 'user', 'content' => 'Say: ready' ) ) ); // phpcs:ignore WordPress.Arrays.ArrayDeclarationSpacing
		if ( is_wp_error( $result ) ) {
			return new \WP_REST_Response(
				array(
					'ok'      => false,
					'message' => $result->get_error_message(),
				)
			);
		}
		return new \WP_REST_Response(
			array(
				'ok'    => true,
				'model' => (string) ( $result['model'] ?? self::settings()['model'] ),
				'reply' => mb_substr( trim( (string) ( $result['content'] ?? '' ) ), 0, 80 ),
			)
		);
	}

	// ---- REST -----------------------------------------------------------------------------

	public function register_rest(): void {
		$args = array(
			'system'   => array(
				'type'     => 'string',
				'required' => true,
			),
			'messages' => array(
				'type'     => 'array',
				'required' => true,
			),
			'tools'    => array(
				'type'     => 'array',
				'required' => false,
			),
		);
		$can  = static function () {
			return current_user_can( 'edit_posts' );
		};
		register_rest_route(
			'auvyx/v1',
			'/ai/chat',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_chat' ),
				'permission_callback' => $can,
				'args'                => $args,
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/ai/test',
			array(
				'methods'             => 'POST',
				'callback'            => array( self::class, 'rest_test' ),
				'permission_callback' => static fn() => current_user_can( 'manage_options' ),
			)
		);
		register_rest_route(
			'auvyx/v1',
			'/ai/stream',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_stream' ),
				'permission_callback' => $can,
				'args'                => $args,
			)
		);
	}

	/**
	 * The conversation of a request, or why it cannot be answered.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array{system: string, messages: array<int, array{role: string, content: string}>}|\WP_Error
	 */
	private static function conversation( $request ) {
		if ( ! self::configured() ) {
			return new \WP_Error( 'auvyx_ai_not_configured', __( 'The AI agent needs this site\'s own AI provider key. Add the provider, key and model in Auvyx Builder → Settings → AI.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$messages = array();
		foreach ( (array) $request->get_param( 'messages' ) as $message ) {
			if ( ! is_array( $message ) ) {
				continue;
			}
			$role = $message['role'] ?? '';
			if ( ! in_array( $role, array( 'user', 'assistant', 'tool' ), true ) ) {
				continue;
			}
			$item = array(
				'role'    => $role,
				'content' => substr( (string) ( $message['content'] ?? '' ), 0, 200000 ),
			);
			if ( 'assistant' === $role && ! empty( $message['toolCalls'] ) && is_array( $message['toolCalls'] ) ) {
				$calls = array();
				foreach ( array_slice( $message['toolCalls'], 0, 16 ) as $call ) {
					if ( ! is_array( $call ) ) {
						continue;
					}
					$name = (string) ( $call['name'] ?? '' );
					if ( ! preg_match( '/^[A-Za-z_][A-Za-z0-9_]{0,64}$/', $name ) ) {
						continue;
					}
					$calls[] = array(
						'id'        => substr( (string) ( $call['id'] ?? '' ), 0, 80 ),
						'name'      => $name,
						'arguments' => substr( (string) ( $call['arguments'] ?? '' ), 0, 200000 ),
					);
				}
				if ( array() !== $calls ) {
					$item['toolCalls'] = $calls;
				}
			}
			if ( 'tool' === $role ) {
				$item['toolCallId'] = substr( (string) ( $message['toolCallId'] ?? '' ), 0, 80 );
			}
			$messages[] = $item;
		}
		if ( array() === $messages ) {
			return new \WP_Error( 'auvyx_ai_empty', __( 'No message.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		return array(
			'system'   => substr( (string) $request->get_param( 'system' ), 0, 100000 ),
			'messages' => $messages,
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_chat( $request ) {
		$chat = self::conversation( $request );
		if ( is_wp_error( $chat ) ) {
			return $chat;
		}
		$result = self::complete( $chat['system'], $chat['messages'], self::tool_list( $request ) );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	/**
	 * The answer as it is written: Server-Sent Events, one `{"d": "text"}` per piece, then `{"done": true}` or
	 * `{"error": "message"}`. The provider's own stream format (OpenAI-compatible or Anthropic) stays on the server.
	 * Takes over the response, so it ends the request itself.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_Error|void
	 */
	public function rest_stream( $request ) {
		$chat = self::conversation( $request );
		if ( is_wp_error( $chat ) ) {
			return $chat;
		}
		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}
		nocache_headers();
		header( 'Content-Type: text/event-stream; charset=utf-8' );
		header( 'Cache-Control: no-cache, no-transform' );
		header( 'X-Accel-Buffering: no' ); // nginx: do not hold the stream back.
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- not available on every host.
		@set_time_limit( 300 );
		self::stream( $chat['system'], $chat['messages'], array( __CLASS__, 'send_event' ), self::tool_list( $request ) );
		exit;
	}

	/**
	 * Writes one event to the client and flushes it.
	 *
	 * @param array<string, mixed> $event Event.
	 */
	public static function send_event( array $event ): void {
		echo 'data: ' . wp_json_encode( $event ) . "\n\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON in an event stream, not HTML.
		flush();
	}

	/**
	 * Tools the client asked to offer, or none.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array<int, mixed>
	 */
	private static function tool_list( $request ): array {
		$tools = $request->get_param( 'tools' );
		return is_array( $tools ) ? $tools : array();
	}

	/**
	 * Neutral messages (user/assistant/tool) in the provider's shape.
	 *
	 * @param array<int, array<string, mixed>> $messages Conversation.
	 * @param string                           $provider `openai` or `anthropic`.
	 * @return array<int, array<string, mixed>>
	 */
	private static function provider_messages( array $messages, string $provider ): array {
		$out     = array();
		$pending = array();
		$flush   = static function () use ( &$out, &$pending, $provider ) {
			if ( array() === $pending ) {
				return;
			}
			if ( 'anthropic' === $provider ) {
				$blocks = array();
				foreach ( $pending as $result ) {
					$blocks[] = array(
						'type'        => 'tool_result',
						'tool_use_id' => $result['id'],
						'content'     => $result['content'],
					);
				}
				$out[] = array(
					'role'    => 'user',
					'content' => $blocks,
				);
			} else {
				foreach ( $pending as $result ) {
					$out[] = array(
						'role'         => 'tool',
						'tool_call_id' => $result['id'],
						'content'      => $result['content'],
					);
				}
			}
			$pending = array();
		};
		foreach ( $messages as $message ) {
			$role = $message['role'] ?? '';
			if ( 'tool' === $role ) {
				$pending[] = array(
					'id'      => (string) ( $message['toolCallId'] ?? '' ),
					'content' => (string) ( $message['content'] ?? '' ),
				);
				continue;
			}
			$flush();
			if ( 'assistant' === $role && ! empty( $message['toolCalls'] ) && is_array( $message['toolCalls'] ) ) {
				$text = (string) ( $message['content'] ?? '' );
				if ( 'anthropic' === $provider ) {
					$blocks = array();
					if ( '' !== $text ) {
						$blocks[] = array(
							'type' => 'text',
							'text' => $text,
						);
					}
					foreach ( $message['toolCalls'] as $call ) {
						$input    = json_decode( (string) ( $call['arguments'] ?? '' ), true );
						$blocks[] = array(
							'type'  => 'tool_use',
							'id'    => (string) ( $call['id'] ?? '' ),
							'name'  => (string) ( $call['name'] ?? '' ),
							'input' => is_array( $input ) ? $input : new stdClass(),
						);
					}
					$out[] = array(
						'role'    => 'assistant',
						'content' => $blocks,
					);
				} else {
					$calls = array();
					foreach ( $message['toolCalls'] as $call ) {
						$calls[] = array(
							'id'       => (string) ( $call['id'] ?? '' ),
							'type'     => 'function',
							'function' => array(
								'name'      => (string) ( $call['name'] ?? '' ),
								'arguments' => (string) ( $call['arguments'] ?? '{}' ),
							),
						);
					}
					$out[] = array(
						'role'       => 'assistant',
						'content'    => '' !== $text ? $text : null,
						'tool_calls' => $calls,
					);
				}
				continue;
			}
			$out[] = array(
				'role'    => $role,
				'content' => (string) ( $message['content'] ?? '' ),
			);
		}
		$flush();
		return $out;
	}

	/**
	 * Neutral tool definitions in the provider's shape. Eight at most.
	 *
	 * @param array<int, mixed> $tools    Tools from the client.
	 * @param string            $provider `openai` or `anthropic`.
	 * @return array<int, array<string, mixed>>
	 */
	private static function provider_tools( array $tools, string $provider ): array {
		$out = array();
		foreach ( array_slice( $tools, 0, 8 ) as $tool ) {
			if ( ! is_array( $tool ) ) {
				continue;
			}
			$name = (string) ( $tool['name'] ?? '' );
			if ( ! preg_match( '/^[A-Za-z_][A-Za-z0-9_]{0,64}$/', $name ) ) {
				continue;
			}
			$parameters  = isset( $tool['parameters'] ) && is_array( $tool['parameters'] ) ? $tool['parameters'] : array( 'type' => 'object' );
			$description = substr( (string) ( $tool['description'] ?? '' ), 0, 2000 );
			if ( 'anthropic' === $provider ) {
				$out[] = array(
					'name'         => $name,
					'description'  => $description,
					'input_schema' => $parameters,
				);
			} else {
				$out[] = array(
					'type'     => 'function',
					'function' => array(
						'name'        => $name,
						'description' => $description,
						'parameters'  => $parameters,
					),
				);
			}
		}
		return $out;
	}

	/**
	 * @param string               $system   System prompt.
	 * @param array<int, mixed>    $messages Conversation, neutral shape.
	 * @param bool                 $stream   Ask for a stream of events.
	 * @param array<int, mixed>    $tools    Tool definitions, neutral shape.
	 * @return array{url: string, headers: array<string, string>, body: array<string, mixed>}
	 */
	private static function request( string $system, array $messages, bool $stream, array $tools = array() ): array {
		$s      = self::settings();
		$key    = self::api_key();
		$mapped = self::provider_messages( $messages, $s['provider'] );
		if ( 'anthropic' === $s['provider'] ) {
			$request = array(
				'url'     => 'https://api.anthropic.com/v1/messages',
				'headers' => array(
					'x-api-key'         => $key,
					'anthropic-version' => '2023-06-01',
				),
				'body'    => array(
					'model'      => $s['model'],
					'system'     => $system,
					'messages'   => $mapped,
					'max_tokens' => 16000,
				),
			);
		} else {
			$request = array(
				'url'     => untrailingslashit( '' !== $s['base_url'] ? $s['base_url'] : 'https://api.openai.com/v1' ) . '/chat/completions',
				'headers' => array(
					'Authorization' => 'Bearer ' . $key,
					'HTTP-Referer'  => home_url( '/' ),
					'X-Title'       => 'Auvyx Builder',
				),
				'body'    => array(
					'model'       => $s['model'],
					'messages'    => array_merge(
						array(
							array(
								'role'    => 'system',
								'content' => $system,
							),
						),
						$mapped
					),
					'temperature' => 0.3,
					'max_tokens'  => 16000,
				),
			);
		}
		$defs = self::provider_tools( $tools, $s['provider'] );
		if ( array() !== $defs ) {
			$request['body']['tools'] = $defs;
		}
		if ( $stream ) {
			$request['body']['stream'] = true;
		}
		return $request;
	}

	/**
	 * What a provider error looks like to the author.
	 *
	 * @param int    $code HTTP status.
	 * @param string $body Response body.
	 */
	private static function provider_error( int $code, string $body ): string {
		$data  = json_decode( $body, true );
		$error = is_array( $data ) ? ( $data['error']['message'] ?? wp_json_encode( $data['error'] ?? $data ) ) : $body;
		/* translators: 1: HTTP status, 2: provider error message */
		return sprintf( __( 'Provider error %1$d: %2$s', 'auvyx-builder' ), $code, substr( (string) $error, 0, 500 ) );
	}

	/**
	 * One completion from the configured provider.
	 *
	 * @param string                                   $system   System prompt.
	 * @param array<int, array{role: string, content: string}> $messages Conversation.
	 * @return array{content: string, model: string}|\WP_Error
	 */
	public static function complete( string $system, array $messages, array $tools = array() ) {
		$s        = self::settings();
		$request  = self::request( $system, $messages, false, $tools );
		$response = wp_remote_post(
			$request['url'],
			array(
				'timeout' => 180,
				'headers' => array_merge( array( 'Content-Type' => 'application/json' ), $request['headers'] ),
				'body'    => wp_json_encode( $request['body'] ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return new \WP_Error( 'auvyx_ai_http', $response->get_error_message(), array( 'status' => 502 ) );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = (string) wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );
		if ( $code >= 400 || ! is_array( $data ) ) {
			return new \WP_Error( 'auvyx_ai_provider', self::provider_error( $code, $body ), array( 'status' => 502 ) );
		}
		if ( 'anthropic' === $s['provider'] ) {
			$content = implode( '', array_map( static fn( $block ) => is_array( $block ) && 'text' === ( $block['type'] ?? '' ) ? (string) $block['text'] : '', (array) ( $data['content'] ?? array() ) ) );
		} else {
			$raw     = $data['choices'][0]['message']['content'] ?? '';
			$content = is_string( $raw ) ? $raw : '';
		}
		$finish = 'anthropic' === $s['provider'] ? (string) ( $data['stop_reason'] ?? '' ) : (string) ( $data['choices'][0]['finish_reason'] ?? '' );
		return array(
			'content' => $content,
			'model'   => (string) ( $data['model'] ?? $s['model'] ),
			'cut_off' => in_array( $finish, array( 'length', 'max_tokens' ), true ),
			'tools'   => self::complete_tools( $s['provider'], $data ),
		);
	}

	/**
	 * Tool calls in a non-streaming provider answer.
	 *
	 * @param string               $provider `openai` or `anthropic`.
	 * @param array<string, mixed> $data     Decoded body.
	 * @return array<int, array{id: string, name: string, arguments: string}>
	 */
	private static function complete_tools( string $provider, array $data ): array {
		$tools = array();
		if ( 'anthropic' === $provider ) {
			foreach ( (array) ( $data['content'] ?? array() ) as $block ) {
				if ( is_array( $block ) && 'tool_use' === ( $block['type'] ?? '' ) && '' !== (string) ( $block['name'] ?? '' ) ) {
					$tools[] = array(
						'id'        => (string) ( $block['id'] ?? '' ),
						'name'      => (string) $block['name'],
						'arguments' => wp_json_encode( $block['input'] ?? new stdClass() ),
					);
				}
			}
		} else {
			foreach ( (array) ( $data['choices'][0]['message']['tool_calls'] ?? array() ) as $i => $call ) {
				if ( ! is_array( $call ) || '' === (string) ( $call['function']['name'] ?? '' ) ) {
					continue;
				}
				$tools[] = array(
					'id'        => '' !== (string) ( $call['id'] ?? '' ) ? (string) $call['id'] : 'call_' . $i,
					'name'      => (string) $call['function']['name'],
					'arguments' => (string) ( $call['function']['arguments'] ?? '' ),
				);
			}
		}
		return $tools;
	}

	/**
	 * Tool-call fragments in one provider event. `$open` accumulates a call until it finishes: OpenAI on
	 * `finish_reason` tool_calls/stop, Anthropic on `content_block_stop`. `$end` flushes whatever is still open.
	 *
	 * @param string                                          $provider `openai` or `anthropic`.
	 * @param string                                          $json     The event's data. Ignored when `$end`.
	 * @param array<int, array{id: string, name: string, args: string}> $open Calls still being written, by index.
	 * @param bool                                            $end      Flush `$open`.
	 * @return array<int, array{id: string, name: string, arguments: string}>
	 */
	public static function take_tools( string $provider, string $json, array &$open, bool $end = false ): array {
		$done  = array();
		$flush = static function ( $index ) use ( &$open, &$done ) {
			if ( ! isset( $open[ $index ] ) ) {
				return;
			}
			$call = $open[ $index ];
			unset( $open[ $index ] );
			$name = (string) ( $call['name'] ?? '' );
			if ( '' === $name || ! preg_match( '/^[A-Za-z_][A-Za-z0-9_]{0,64}$/', $name ) ) {
				return;
			}
			$id     = (string) ( $call['id'] ?? '' );
			$done[] = array(
				'id'        => '' !== $id ? $id : 'call_' . $index,
				'name'      => $name,
				'arguments' => (string) ( $call['args'] ?? '' ),
			);
		};
		if ( $end ) {
			foreach ( array_keys( $open ) as $index ) {
				$flush( $index );
			}
			return $done;
		}
		$data = json_decode( $json, true );
		if ( ! is_array( $data ) ) {
			return $done;
		}
		if ( 'anthropic' === $provider ) {
			$type  = $data['type'] ?? '';
			$index = $data['index'] ?? 0;
			if ( 'content_block_start' === $type && 'tool_use' === ( $data['content_block']['type'] ?? '' ) ) {
				$open[ $index ] = array(
					'id'   => (string) ( $data['content_block']['id'] ?? '' ),
					'name' => (string) ( $data['content_block']['name'] ?? '' ),
					'args' => '',
				);
			} elseif ( 'content_block_delta' === $type && 'input_json_delta' === ( $data['delta']['type'] ?? '' ) ) {
				if ( ! isset( $open[ $index ] ) ) {
					$open[ $index ] = array(
						'id'   => '',
						'name' => '',
						'args' => '',
					);
				}
				$open[ $index ]['args'] .= (string) ( $data['delta']['partial_json'] ?? '' );
			} elseif ( 'content_block_stop' === $type ) {
				$flush( $index );
			}
			return $done;
		}
		$deltas = $data['choices'][0]['delta']['tool_calls'] ?? array();
		if ( is_array( $deltas ) ) {
			foreach ( $deltas as $delta ) {
				if ( ! is_array( $delta ) ) {
					continue;
				}
				$index = $delta['index'] ?? 0;
				if ( ! isset( $open[ $index ] ) ) {
					$open[ $index ] = array(
						'id'   => '',
						'name' => '',
						'args' => '',
					);
				}
				if ( ! empty( $delta['id'] ) ) {
					$open[ $index ]['id'] .= (string) $delta['id'];
				}
				$fn = $delta['function'] ?? array();
				if ( is_array( $fn ) ) {
					if ( ! empty( $fn['name'] ) ) {
						$open[ $index ]['name'] .= (string) $fn['name'];
					}
					if ( isset( $fn['arguments'] ) && is_string( $fn['arguments'] ) ) {
						$open[ $index ]['args'] .= $fn['arguments'];
					}
				}
			}
		}
		$reason = (string) ( $data['choices'][0]['finish_reason'] ?? '' );
		if ( 'tool_calls' === $reason || 'stop' === $reason ) {
			foreach ( array_keys( $open ) as $index ) {
				$flush( $index );
			}
		}
		return $done;
	}

	/**
	 * The text piece of one provider stream event, or an error.
	 *
	 * @param string $provider `openai` or `anthropic`.
	 * @param string $json     The event's data.
	 * @return array{text: string, error: string, cut: bool} Empty when the event carries none of them; `cut` is true
	 *                                                       when the provider stopped at its output limit.
	 */
	public static function stream_piece( string $provider, string $json ): array {
		$none = array(
			'text'  => '',
			'error' => '',
			'cut'   => false,
		);
		$data = json_decode( $json, true );
		if ( ! is_array( $data ) ) {
			return $none;
		}
		if ( isset( $data['error'] ) ) {
			$message = is_array( $data['error'] ) ? ( $data['error']['message'] ?? wp_json_encode( $data['error'] ) ) : $data['error'];
			return array(
				'text'  => '',
				'error' => substr( (string) $message, 0, 500 ),
				'cut'   => false,
			);
		}
		if ( 'anthropic' === $provider ) {
			$text = 'content_block_delta' === ( $data['type'] ?? '' ) && 'text_delta' === ( $data['delta']['type'] ?? '' ) ? (string) $data['delta']['text'] : '';
			$cut  = 'message_delta' === ( $data['type'] ?? '' ) && 'max_tokens' === ( $data['delta']['stop_reason'] ?? '' );
		} else {
			$content = $data['choices'][0]['delta']['content'] ?? '';
			$text    = is_string( $content ) ? $content : '';
			$cut     = 'length' === ( $data['choices'][0]['finish_reason'] ?? '' );
		}
		return array(
			'text'  => $text,
			'error' => '',
			'cut'   => $cut,
		);
	}

	/**
	 * Streams one completion to `$emit`: events `{d}` for each text piece, `{tool}` for each finished tool call, then
	 * `{done}` or `{error}`. Without cURL (it streams as the bytes arrive; WordPress' HTTP API only returns whole bodies)
	 * the answer comes in one piece.
	 *
	 * @param string                                   $system   System prompt.
	 * @param array<int, array{role: string, content: string}> $messages Conversation.
	 * @param callable                                 $emit     Receives each event as an array.
	 * @param array<int, mixed>                        $tools    Tool definitions, neutral shape.
	 */
	public static function stream( string $system, array $messages, callable $emit, array $tools = array() ): void {
		if ( ! function_exists( 'curl_init' ) ) {
			$result = self::complete( $system, $messages, $tools );
			if ( is_wp_error( $result ) ) {
				call_user_func( $emit, array( 'error' => $result->get_error_message() ) );
				return;
			}
			call_user_func( $emit, array( 'd' => $result['content'] ) );
			foreach ( $result['tools'] as $tool ) {
				call_user_func( $emit, array( 'tool' => $tool ) );
			}
			if ( $result['cut_off'] ) {
				call_user_func( $emit, array( 'cut' => true ) );
			}
			call_user_func( $emit, array( 'done' => true ) );
			return;
		}
		$provider = self::settings()['provider'];
		$request  = self::request( $system, $messages, true, $tools );
		$lines    = array( 'Content-Type: application/json', 'Accept: text/event-stream' );
		foreach ( $request['headers'] as $name => $value ) {
			$lines[] = $name . ': ' . $value;
		}
		// When the reader leaves, PHP would abort the script from inside cURL's callback and leave the provider's connection
		// open (the answer keeps being generated and billed). Handle the abort ourselves: stop cURL from the callback.
		ignore_user_abort( true );
		$buffer = '';
		$failed = '';
		$sent   = false;
		$cut    = false;
		$open   = array();
		$ch     = curl_init( $request['url'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.curl_curl_init -- WordPress' HTTP API cannot stream.
		// phpcs:disable WordPress.WP.AlternativeFunctions.curl_curl_setopt
		curl_setopt( $ch, CURLOPT_POST, true );
		curl_setopt( $ch, CURLOPT_HTTPHEADER, $lines );
		curl_setopt( $ch, CURLOPT_POSTFIELDS, wp_json_encode( $request['body'] ) );
		curl_setopt( $ch, CURLOPT_CONNECTTIMEOUT, 15 );
		curl_setopt( $ch, CURLOPT_TIMEOUT, 300 );
		curl_setopt(
			$ch,
			CURLOPT_WRITEFUNCTION,
			static function ( $handle, $chunk ) use ( &$buffer, &$failed, &$sent, &$cut, &$open, $provider, $emit ) {
				if ( connection_aborted() ) {
					return 0; // The reader went away (Stop, closed tab): stop paying for the answer.
				}
				$buffer .= $chunk;
				// phpcs:ignore WordPress.WP.AlternativeFunctions.curl_curl_getinfo
				if ( (int) curl_getinfo( $handle, CURLINFO_HTTP_CODE ) >= 400 ) {
					return strlen( $chunk ); // An error body is JSON, read at the end.
				}
				while ( false !== ( $end = strpos( $buffer, "\n" ) ) ) { // phpcs:ignore Generic.CodeAnalysis.AssignmentInCondition.FoundInWhileCondition
					$line   = rtrim( substr( $buffer, 0, $end ), "\r" );
					$buffer = substr( $buffer, $end + 1 );
					if ( 0 !== strpos( $line, 'data:' ) ) {
						continue;
					}
					$json = ltrim( substr( $line, 5 ) );
					if ( '[DONE]' === $json ) {
						continue;
					}
					$piece = self::stream_piece( $provider, $json );
					if ( '' !== $piece['error'] ) {
						$failed = $piece['error'];
					} elseif ( '' !== $piece['text'] ) {
						$sent = true;
						call_user_func( $emit, array( 'd' => $piece['text'] ) );
					}
					foreach ( self::take_tools( $provider, $json, $open ) as $tool ) {
						$sent = true;
						call_user_func( $emit, array( 'tool' => $tool ) );
					}
					$cut = $cut || $piece['cut'];
				}
				return strlen( $chunk );
			}
		);
		curl_exec( $ch ); // phpcs:ignore WordPress.WP.AlternativeFunctions.curl_curl_exec
		$code  = (int) curl_getinfo( $ch, CURLINFO_HTTP_CODE ); // phpcs:ignore WordPress.WP.AlternativeFunctions.curl_curl_getinfo
		$error = curl_error( $ch ); // phpcs:ignore WordPress.WP.AlternativeFunctions.curl_curl_error
		curl_close( $ch ); // phpcs:ignore WordPress.WP.AlternativeFunctions.curl_curl_close
		// phpcs:enable WordPress.WP.AlternativeFunctions.curl_curl_setopt
		if ( $code >= 400 ) {
			call_user_func( $emit, array( 'error' => self::provider_error( $code, $buffer ) ) );
		} elseif ( '' !== $failed ) {
			call_user_func( $emit, array( 'error' => $failed ) );
		} elseif ( '' !== $error && ! $sent ) {
			call_user_func( $emit, array( 'error' => $error ) );
		} else {
			foreach ( self::take_tools( $provider, '', $open, true ) as $tool ) {
				call_user_func( $emit, array( 'tool' => $tool ) );
			}
			if ( $cut ) {
				call_user_func( $emit, array( 'cut' => true ) ); // The answer stopped at the model's output limit.
			}
			call_user_func( $emit, array( 'done' => true ) );
		}
	}
}
