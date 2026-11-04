<?php
/**
 * Auvyx Form: forms visitors fill in (contact, quote, sign-up), the same as on EzyPlatform (apps/studio shared/Forms.scala).
 *
 * The form is a `auvyx/form` block whose attributes hold its definition (id, fields, button, message after sending), edited in Auvyx Studio.
 * It posts to admin-post.php. What is sent is checked against the definition found in the site's published content (never against
 * the request), from a page of this site only (Origin, else Referer), with a field people never see that must stay empty, a few
 * sendings a minute per address, and at most 64 KB. It is kept as a private `auvyx_form_entry` post, read in Auvyx Builder > Form entries
 * (and exported as CSV there). Then an email to the site (Reply-To the visitor) and the `auvyx_form_sent` action for integrations;
 * Auvyx Builder Pro adds the definition's redirect and webhook.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Forms;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class Forms implements Module {

	public const BLOCK      = 'auvyx/form';
	public const ENTRY      = 'auvyx_form_entry';
	public const ACTION     = 'auvyx_form';
	public const MAX_FIELDS = 30;
	public const MAX_TEXT   = 300;
	public const MAX_LONG   = 5000;
	public const MAX_BYTES  = 65536;
	public const KINDS      = array( 'text', 'email', 'tel', 'number', 'date', 'textarea', 'select', 'radio', 'checkbox', 'url' );
	public const CHOICES    = array( 'select', 'radio' );
	public const MAX_TO     = 5;
	public const EXPORT     = 'auvyx_form_export';

	public function id(): string {
		return 'forms';
	}

	public function requires(): array {
		return array( 'wp' => '6.5' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_types' ) );
		add_action( 'admin_post_nopriv_' . self::ACTION, array( $this, 'handle' ) );
		add_action( 'admin_post_' . self::ACTION, array( $this, 'handle' ) );
		add_action( 'add_meta_boxes_' . self::ENTRY, array( $this, 'meta_box' ) );
		add_filter( 'manage_' . self::ENTRY . '_posts_columns', array( $this, 'columns' ) );
		add_action( 'manage_' . self::ENTRY . '_posts_custom_column', array( $this, 'column' ), 10, 2 );
		add_action( 'restrict_manage_posts', array( $this, 'export_button' ) );
		add_action( 'admin_post_' . self::EXPORT, array( $this, 'export' ) );
	}

	public function register_types(): void {
		if ( ! \WP_Block_Type_Registry::get_instance()->is_registered( self::BLOCK ) ) {
			register_block_type(
				self::BLOCK,
				array(
					'title'           => __( 'Auvyx Form', 'auvyx-builder' ),
					'category'        => 'auvyx-builder',
					'attributes'      => array(
						'id'       => array( 'type' => 'string' ),
						'fields'   => array( 'type' => 'array' ),
						'submit'   => array( 'type' => 'string' ),
						'success'  => array( 'type' => 'string' ),
						'mail'     => array( 'type' => 'boolean' ),
						'to'       => array( 'type' => 'string' ),
						'subject'  => array( 'type' => 'string' ),
						'redirect' => array( 'type' => 'string' ),
						'webhook'  => array( 'type' => 'string' ),
					),
					'render_callback' => static function ( $attributes ) {
						$form = self::parse( is_array( $attributes ) ? $attributes : array() );
						return null === $form ? '' : self::html( $form, admin_url( 'admin-post.php' ), array( 'action' => self::ACTION ) );
					},
				)
			);
		}
		register_post_type(
			self::ENTRY,
			array(
				'labels'          => array(
					'name'          => __( 'Form entries', 'auvyx-builder' ),
					'singular_name' => __( 'Form entry', 'auvyx-builder' ),
					'menu_name'     => __( 'Form entries', 'auvyx-builder' ),
				),
				'public'          => false,
				'show_ui'         => true,
				'show_in_menu'    => 'auvyx-builder',
				'show_in_rest'    => false,
				'supports'        => array( 'title' ),
				'capability_type' => 'post',
				// Entries are made by visitors only; the site's administrators read and remove them.
				'capabilities'    => array(
					'create_posts'       => 'do_not_allow',
					'edit_post'          => 'manage_options',
					'read_post'          => 'manage_options',
					'delete_post'        => 'manage_options',
					'edit_posts'         => 'manage_options',
					'edit_others_posts'  => 'manage_options',
					'delete_posts'       => 'manage_options',
					'publish_posts'      => 'manage_options',
					'read_private_posts' => 'manage_options',
				),
				'map_meta_cap'    => false,
			)
		);
	}

	// ---- the definition ---------------------------------------------------------------------------

	/**
	 * A form from block attributes; null when it is not a well-formed one. Unknown kinds and bad names are dropped.
	 *
	 * @param array<string, mixed> $attributes Block attributes.
	 * @return array{id: string, fields: array<int, array<string, mixed>>, submit: string, success: string}|null
	 */
	public static function parse( array $attributes ): ?array {
		$id = is_string( $attributes['id'] ?? null ) ? trim( $attributes['id'] ) : '';
		if ( ! preg_match( '/^[a-z0-9][a-z0-9_-]{2,40}$/', $id ) ) {
			return null;
		}
		$fields = array();
		$names  = array();
		foreach ( is_array( $attributes['fields'] ?? null ) ? $attributes['fields'] : array() as $field ) {
			if ( ! is_array( $field ) || count( $fields ) >= self::MAX_FIELDS ) {
				continue;
			}
			$name = is_string( $field['name'] ?? null ) ? trim( $field['name'] ) : '';
			$kind = is_string( $field['kind'] ?? null ) ? trim( $field['kind'] ) : '';
			if ( ! preg_match( '/^[a-z][a-z0-9_]{0,39}$/', $name ) || ! in_array( $kind, self::KINDS, true ) || isset( $names[ $name ] ) ) {
				continue;
			}
			$names[ $name ] = true;
			$options        = array();
			foreach ( is_array( $field['options'] ?? null ) ? $field['options'] : array() as $option ) {
				$option = is_string( $option ) ? mb_substr( trim( $option ), 0, self::MAX_TEXT ) : '';
				if ( '' !== $option && ! in_array( $option, $options, true ) && count( $options ) < 30 ) {
					$options[] = $option;
				}
			}
			$label    = is_string( $field['label'] ?? null ) ? mb_substr( trim( $field['label'] ), 0, 120 ) : '';
			$fields[] = array(
				'name'        => $name,
				'label'       => '' !== $label ? $label : $name,
				'kind'        => $kind,
				'required'    => true === ( $field['required'] ?? false ),
				'options'     => $options,
				'placeholder' => is_string( $field['placeholder'] ?? null ) ? mb_substr( trim( $field['placeholder'] ), 0, 120 ) : '',
			);
		}
		$submit  = is_string( $attributes['submit'] ?? null ) ? mb_substr( trim( $attributes['submit'] ), 0, 60 ) : '';
		$success = is_string( $attributes['success'] ?? null ) ? mb_substr( trim( $attributes['success'] ), 0, 300 ) : '';
		$text    = static function ( string $key, int $max ) use ( $attributes ): string {
			return is_string( $attributes[ $key ] ?? null ) ? mb_substr( trim( $attributes[ $key ] ), 0, $max ) : '';
		};
		return array(
			'id'       => $id,
			'fields'   => $fields,
			'submit'   => '' !== $submit ? $submit : 'Send',
			'success'  => '' !== $success ? $success : 'Thank you. We received your message.',
			'mail'     => false !== ( $attributes['mail'] ?? true ),
			'to'       => self::recipients( $text( 'to', 2000 ) ),
			'subject'  => $text( 'subject', 150 ),
			'redirect' => self::safe_url( $text( 'redirect', 400 ), true ),
			'webhook'  => self::safe_url( $text( 'webhook', 400 ), false ),
		);
	}

	/** Well-formed addresses only, at most MAX_TO, joined by ", " (shared/Forms.scala recipients). */
	public static function recipients( string $to ): string {
		$out = array();
		foreach ( preg_split( '/[,;\s]+/', $to ) as $address ) {
			$address = trim( (string) $address );
			if ( '' !== $address && mb_strlen( $address ) <= 320 && self::is_email( $address ) && ! in_array( $address, $out, true ) && count( $out ) < self::MAX_TO ) {
				$out[] = $address;
			}
		}
		return implode( ', ', $out );
	}

	private static function is_email( string $value ): bool {
		return (bool) preg_match( '/^[^\s@<>"\']{1,64}@[^\s@<>"\']{1,253}\.[^\s@<>"\']{2,}$/u', $value );
	}

	/** A path of the site (when $allow_path) or an http(s) address; anything else is "" (shared/Forms.scala safeUrl). */
	public static function safe_url( string $url, bool $allow_path ): string {
		$url = trim( $url );
		if ( mb_strlen( $url ) > 300 || preg_match( '/[\s"\'<>\\\\\x00-\x1f]/', $url ) ) {
			return '';
		}
		$ok = preg_match( '#^https?://[^/?\#]+#i', $url ) || ( $allow_path && 0 === strpos( $url, '/' ) && 0 !== strpos( $url, '//' ) );
		return $ok ? $url : '';
	}

	/**
	 * The form's HTML (the same markup as shared/Forms.scala). Messages for after sending are anchors the visitor is sent back to,
	 * shown by CSS (:target), so nothing needs JavaScript.
	 *
	 * @param array<string, mixed>  $form   Form.
	 * @param array<string, string> $hidden Hidden values.
	 */
	public static function html( array $form, string $action, array $hidden = array() ): string {
		$id   = esc_attr( $form['id'] );
		$out  = sprintf( '<form class="auvyx-form" id="auvyx-form-%1$s" action="%2$s" method="post" accept-charset="UTF-8">', $id, esc_url( $action ) );
		$out .= sprintf( '<p class="auvyx-form__sent" id="auvyx-form-%1$s-sent" role="status">%2$s</p>', $id, esc_html( $form['success'] ) );
		$out .= sprintf( '<p class="auvyx-form__error" id="auvyx-form-%1$s-error" role="alert">%2$s</p>', $id, esc_html__( 'Your message could not be sent. Check the fields and try again.', 'auvyx-builder' ) );
		foreach ( $form['fields'] as $f ) {
			$fid   = 'auvyx-' . $id . '-' . esc_attr( $f['name'] );
			$req   = $f['required'] ? ' required' : '';
			$star  = $f['required'] ? '<span class="auvyx-form__req" aria-hidden="true">*</span>' : '';
			$label = sprintf( '<label class="auvyx-form__label" for="%1$s">%2$s%3$s</label>', $fid, esc_html( $f['label'] ), $star );
			$ph    = '' !== $f['placeholder'] ? sprintf( ' placeholder="%s"', esc_attr( $f['placeholder'] ) ) : '';
			$name  = esc_attr( $f['name'] );
			switch ( $f['kind'] ) {
				case 'textarea':
					$control = sprintf( '<textarea class="auvyx-form__control" id="%1$s" name="%2$s" rows="5" maxlength="%3$d"%4$s%5$s></textarea>', $fid, $name, self::MAX_LONG, $ph, $req );
					break;
				case 'select':
					$options = '<option value="">—</option>';
					foreach ( $f['options'] as $option ) {
						$options .= sprintf( '<option value="%1$s">%2$s</option>', esc_attr( $option ), esc_html( $option ) );
					}
					$control = sprintf( '<select class="auvyx-form__control" id="%1$s" name="%2$s"%3$s>%4$s</select>', $fid, $name, $req, $options );
					break;
				case 'radio':
					$control = '';
					foreach ( $f['options'] as $i => $option ) {
						$control .= sprintf( '<label class="auvyx-form__choice"><input class="auvyx-form__check" type="radio" id="%1$s-%2$d" name="%3$s" value="%4$s"%5$s> %6$s</label>', $fid, $i, $name, esc_attr( $option ), $req, esc_html( $option ) );
					}
					break;
				case 'checkbox':
					$control = sprintf( '<input class="auvyx-form__check" type="checkbox" id="%1$s" name="%2$s" value="yes"%3$s>', $fid, $name, $req );
					break;
				default:
					$control = sprintf( '<input class="auvyx-form__control" type="%1$s" id="%2$s" name="%3$s" maxlength="%4$d"%5$s%6$s>', esc_attr( $f['kind'] ), $fid, $name, self::MAX_TEXT, $ph, $req );
			}
			if ( 'checkbox' === $f['kind'] ) {
				$out .= '<div class="auvyx-form__field auvyx-form__field--check">' . $control . $label . '</div>';
			} elseif ( 'radio' === $f['kind'] ) {
				$out .= '<fieldset class="auvyx-form__field auvyx-form__field--choices"><legend class="auvyx-form__label">' . esc_html( $f['label'] ) . $star . '</legend>' . $control . '</fieldset>';
			} else {
				$out .= '<div class="auvyx-form__field">' . $label . $control . '</div>';
			}
		}
		$out .= '<div class="auvyx-form__trap" aria-hidden="true"><label>Leave this empty<input type="text" name="_auvyx_hp" tabindex="-1" autocomplete="off"></label></div>';
		foreach ( $hidden + array( '_auvyx_form' => $form['id'] ) as $key => $value ) {
			$out .= sprintf( '<input type="hidden" name="%1$s" value="%2$s">', esc_attr( $key ), esc_attr( $value ) );
		}
		return $out . sprintf( '<button class="auvyx-form__submit" type="submit">%s</button></form>', esc_html( $form['submit'] ) );
	}

	/**
	 * What a visitor sent, checked against the form. Answers in the form's order, or what is wrong.
	 *
	 * @param array<string, mixed> $form   Form.
	 * @param array<string, mixed> $values Sent values (unslashed).
	 * @return array{0: string[], 1: array<int, array{name: string, label: string, value: string}>}
	 */
	public static function validate( array $form, array $values ): array {
		$problems = array();
		$answers  = array();
		foreach ( $form['fields'] as $f ) {
			$sent = $values[ $f['name'] ] ?? '';
			if ( is_array( $sent ) ) {
				$problems[] = $f['label'] . ': one value only';
				continue;
			}
			$value = trim( str_replace( "\0", '', (string) $sent ) );
			if ( '' === $value ) {
				if ( $f['required'] ) {
					$problems[] = $f['label'] . ' is required';
				} else {
					$answers[] = array(
						'name'  => $f['name'],
						'label' => $f['label'],
						'value' => '',
					);
				}
				continue;
			}
			switch ( $f['kind'] ) {
				case 'email':
					$ok = mb_strlen( $value ) <= 320 && (bool) preg_match( '/^[^\s@<>"\']{1,64}@[^\s@<>"\']{1,253}\.[^\s@<>"\']{2,}$/u', $value );
					break;
				case 'tel':
					$ok = (bool) preg_match( '/^[0-9+()\-.\s]{3,30}$/', $value );
					break;
				case 'number':
					$ok = (bool) preg_match( '/^-?\d{1,15}(\.\d{1,6})?$/', $value );
					break;
				case 'date':
					$ok = (bool) preg_match( '/^\d{4}-\d{2}-\d{2}$/', $value );
					break;
				case 'select':
				case 'radio':
					$ok = in_array( $value, $f['options'], true );
					break;
				case 'url':
					$ok = mb_strlen( $value ) <= self::MAX_TEXT && (bool) preg_match( '#^https?://[^\s<>"\']{1,2000}$#i', $value );
					break;
				case 'checkbox':
					$ok = 'yes' === $value;
					break;
				case 'textarea':
					$ok = mb_strlen( $value ) <= self::MAX_LONG;
					break;
				default:
					$ok = mb_strlen( $value ) <= self::MAX_TEXT;
			}
			if ( $ok ) {
				$answers[] = array(
					'name'  => $f['name'],
					'label' => $f['label'],
					'value' => $value,
				);
			} else {
				$problems[] = $f['label'] . ' is not valid';
			}
		}
		return array( $problems, $problems ? array() : $answers );
	}

	/**
	 * The published form with this id: looked up in the site's published content (pages, posts, template parts, synced patterns),
	 * so the definition that is checked is the one visitors are shown.
	 *
	 * @return array{0: array<string, mixed>, 1: int}|null The form and the post that carries it.
	 */
	public static function find( string $form_id ): ?array {
		global $wpdb;
		if ( ! preg_match( '/^[a-z0-9][a-z0-9_-]{2,40}$/', $form_id ) ) {
			return null;
		}
		$like = '%' . $wpdb->esc_like( '"id":"' . $form_id . '"' ) . '%';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- a lookup by content, once per sending.
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_status = 'publish' AND post_type IN ('page','post','wp_template','wp_template_part','wp_block') AND post_content LIKE %s ORDER BY ID LIMIT 20", $like ) );
		foreach ( $ids as $id ) {
			$found = self::find_in( parse_blocks( (string) get_post_field( 'post_content', (int) $id ) ), $form_id );
			if ( null !== $found ) {
				return array( $found, (int) $id );
			}
		}
		return null;
	}

	/** @param array<int, array<string, mixed>> $blocks Parsed blocks. */
	private static function find_in( array $blocks, string $form_id ): ?array {
		foreach ( $blocks as $block ) {
			if ( self::BLOCK === ( $block['blockName'] ?? '' ) ) {
				$form = self::parse( is_array( $block['attrs'] ?? null ) ? $block['attrs'] : array() );
				if ( null !== $form && $form['id'] === $form_id ) {
					return $form;
				}
			}
			$inner = self::find_in( is_array( $block['innerBlocks'] ?? null ) ? $block['innerBlocks'] : array(), $form_id );
			if ( null !== $inner ) {
				return $inner;
			}
		}
		return null;
	}

	// ---- receiving ----------------------------------------------------------------------------------

	/** Sent from a page of this site: its Origin, or when a browser sends none, its Referer. */
	public static function same_site( string $origin, string $referer ): bool {
		$home = wp_parse_url( home_url( '/' ) );
		$own  = strtolower( ( $home['scheme'] ?? 'http' ) . '://' . ( $home['host'] ?? '' ) . ( isset( $home['port'] ) ? ':' . $home['port'] : '' ) );
		if ( '' !== $origin ) {
			return strtolower( rtrim( $origin, '/' ) ) === $own;
		}
		return '' !== $referer && ( strtolower( $referer ) === $own || 0 === strpos( strtolower( $referer ), $own . '/' ) );
	}

	/** A few sendings a minute per address and form. */
	public static function allow( string $address, string $form_id ): bool {
		$key   = 'auvyx_form_rl_' . md5( $address . '|' . $form_id );
		$count = (int) get_transient( $key );
		if ( $count >= 5 ) {
			return false;
		}
		set_transient( $key, $count + 1, MINUTE_IN_SECONDS );
		return true;
	}

	public function handle(): void {
		$referer = (string) wp_get_raw_referer();
		$back    = '' !== $referer ? wp_validate_redirect( $referer, home_url( '/' ) ) : home_url( '/' );
		$form_id = isset( $_POST['_auvyx_form'] ) ? sanitize_key( wp_unslash( $_POST['_auvyx_form'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- a public form: checked by origin, trap and rate limit instead of a nonce, which caching would break.
		$go      = static function ( string $outcome ) use ( $back, $form_id ): void {
			wp_safe_redirect( strtok( $back, '#' ) . '#auvyx-form-' . $form_id . '-' . $outcome, 303 );
			exit;
		};
		$origin  = isset( $_SERVER['HTTP_ORIGIN'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_ORIGIN'] ) ) : '';
		$length  = isset( $_SERVER['CONTENT_LENGTH'] ) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
		if ( ! self::same_site( $origin, $referer ) || $length > self::MAX_BYTES ) {
			$go( 'error' );
		}
		$values = wp_unslash( $_POST ); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- see above; every value is checked against the form below.
		if ( '' !== trim( (string) ( $values['_auvyx_hp'] ?? '' ) ) ) {
			$go( 'sent' ); // A program filled in the trap: it is told it worked, and nothing is kept.
		}
		$found = self::find( $form_id );
		$ip    = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		if ( null === $found || ! self::allow( $ip, $form_id ) ) {
			$go( 'error' );
		}
		list( $problems, $answers ) = self::validate( $found[0], is_array( $values ) ? $values : array() );
		if ( $problems ) {
			$go( 'error' );
		}
		$page  = (string) wp_make_link_relative( $back );
		$entry = self::keep( $found[0], $found[1], $answers, $page );
		self::notify( $found[0], $answers, $back, wp_strip_all_tags( get_the_title( $found[1] ) ) );
		/**
		 * After a sending is kept: for integrations (CRM, newsletter, Slack…).
		 *
		 * @param array  $form    The published definition.
		 * @param array  $answers Label and value of each field, in the form's order.
		 * @param int    $entry   The kept entry (0 if it could not be kept).
		 * @param string $page    The page it was sent from.
		 */
		do_action( 'auvyx_form_sent', $found[0], $answers, $entry, $page ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- the documented name (auvyx_ prefix).
		/**
		 * Where to send the visitor after a sending ("" = back to the form's message). Auvyx Builder Pro answers the form's
		 * `redirect`.
		 *
		 * @param string $to   An absolute http(s) address, or "".
		 * @param array  $form The published definition.
		 */
		$to = (string) apply_filters( 'auvyx_builder_form_redirect', '', $found[0] );
		if ( '' !== $to && preg_match( '#^https?://#i', $to ) ) {
			// phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- the site owner's address from the published definition, never the request's.
			wp_redirect( esc_url_raw( $to ), 303 );
			exit;
		}
		$go( 'sent' );
	}

	/**
	 * The email to the site: to the form's recipients, or the administrator. Reply-To is the visitor's address when the form asks for one,
	 * so answering the email answers them. Only text: nothing typed is markup.
	 *
	 * @param array<string, mixed>                                          $form    Form.
	 * @param array<int, array{name: string, label: string, value: string}> $answers Answers.
	 * @param string                                                        $page    The page's address.
	 * @param string                                                        $where   The page's title, for the subject.
	 */
	public static function notify( array $form, array $answers, string $page, string $where = '' ): bool {
		if ( empty( $form['mail'] ) ) {
			return false;
		}
		$to = '' !== $form['to'] ? $form['to'] : (string) get_option( 'admin_email' );
		if ( '' === $to ) {
			return false;
		}
		$site = wp_specialchars_decode( (string) get_bloginfo( 'name' ), ENT_QUOTES );
		/* translators: 1: site name, 2: the page the form is on (or the form's id) */
		$subject = '' !== $form['subject'] ? $form['subject'] : sprintf( __( '[%1$s] New message from %2$s', 'auvyx-builder' ), $site, '' !== $where ? $where : $form['id'] );
		$lines   = array();
		$reply   = '';
		foreach ( $answers as $answer ) {
			$lines[] = $answer['label'] . ":\n" . ( '' !== $answer['value'] ? $answer['value'] : '—' );
			foreach ( $form['fields'] as $f ) {
				if ( '' === $reply && $f['name'] === $answer['name'] && 'email' === $f['kind'] && '' !== $answer['value'] ) {
					$reply = $answer['value'];
				}
			}
		}
		/* translators: %s: page address */
		$lines[] = '--' . "\n" . sprintf( __( 'Sent from %s', 'auvyx-builder' ), strtok( $page, '#' ) );
		$headers = array( 'Content-Type: text/plain; charset=UTF-8' );
		if ( '' !== $reply ) {
			$headers[] = 'Reply-To: ' . str_replace( array( "\r", "\n" ), '', $reply );
		}
		$body = implode( "\n\n", $lines );
		/**
		 * The notification before it is sent: return false to send none.
		 *
		 * @param array{to: string, subject: string, body: string, headers: string[]} $mail What is sent.
		 * @param array                                                             $form The definition.
		 */
		$mail = apply_filters( 'auvyx_form_mail', compact( 'to', 'subject', 'body', 'headers' ), $form ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- the documented name (auvyx_ prefix).
		if ( ! is_array( $mail ) ) {
			return false;
		}
		return wp_mail( $mail['to'], str_replace( array( "\r", "\n" ), ' ', (string) $mail['subject'] ), (string) $mail['body'], $mail['headers'] );
	}

	/**
	 * Keeps a sending that passed validate().
	 *
	 * @param array<string, mixed>                                      $form    Form.
	 * @param array<int, array{name: string, label: string, value: string}> $answers Answers.
	 */
	public static function keep( array $form, int $post_id, array $answers, string $page ): int {
		$id = wp_insert_post(
			array(
				'post_type'   => self::ENTRY,
				'post_status' => 'private',
				'post_parent' => $post_id,
				'post_title'  => sprintf( '%1$s · %2$s', $form['id'], current_time( 'mysql' ) ),
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return 0;
		}
		update_post_meta( $id, '_auvyx_form', $form['id'] );
		update_post_meta( $id, '_auvyx_page', mb_substr( $page, 0, 300 ) );
		update_post_meta( $id, '_auvyx_answers', wp_slash( (string) wp_json_encode( $answers ) ) );
		return (int) $id;
	}

	// ---- reading ------------------------------------------------------------------------------------

	/** @return array<int, array{name: string, label: string, value: string}> */
	public static function answers( int $entry_id ): array {
		$answers = json_decode( (string) get_post_meta( $entry_id, '_auvyx_answers', true ), true );
		return is_array( $answers ) ? $answers : array();
	}

	public function meta_box(): void {
		add_meta_box(
			'auvyx-form-answers',
			__( 'What was sent', 'auvyx-builder' ),
			static function ( \WP_Post $post ): void {
				echo '<table class="widefat striped"><tbody>';
				foreach ( self::answers( $post->ID ) as $answer ) {
					printf( '<tr><th style="width:30%%">%1$s</th><td style="white-space:pre-wrap">%2$s</td></tr>', esc_html( $answer['label'] ?? '' ), esc_html( $answer['value'] ?? '' ) );
				}
				printf( '<tr><th>%1$s</th><td>%2$s</td></tr>', esc_html__( 'From page', 'auvyx-builder' ), esc_html( (string) get_post_meta( $post->ID, '_auvyx_page', true ) ) );
				echo '</tbody></table>';
			},
			self::ENTRY,
			'normal'
		);
	}

	/**
	 * @param array<string, string> $columns List columns.
	 * @return array<string, string>
	 */
	public function columns( array $columns ): array {
		return array(
			'cb'            => $columns['cb'] ?? '',
			'title'         => __( 'Entry', 'auvyx-builder' ),
			'auvyx_form'    => __( 'Form', 'auvyx-builder' ),
			'auvyx_summary' => __( 'Sent', 'auvyx-builder' ),
			'date'          => $columns['date'] ?? __( 'Date', 'auvyx-builder' ),
		);
	}

	/** "Export CSV" above the entries list, for the form chosen in the list's filter, or every form. */
	public function export_button( $post_type ): void {
		if ( self::ENTRY !== $post_type || ! current_user_can( 'edit_posts' ) ) {
			return;
		}
		printf(
			'<a class="button" href="%1$s">%2$s</a>',
			esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . self::EXPORT ), self::EXPORT ) ),
			esc_html__( 'Export CSV', 'auvyx-builder' )
		);
	}

	/**
	 * Every entry as one CSV row: date, form, page, then one column per field label met (in the order first met).
	 *
	 * @param int[] $ids Entry ids.
	 * @return array<int, array<int, string>>
	 */
	public static function rows( array $ids ): array {
		$columns = array();
		$entries = array();
		foreach ( $ids as $id ) {
			$values = array();
			foreach ( self::answers( (int) $id ) as $answer ) {
				$label = (string) ( $answer['label'] ?? '' );
				if ( ! in_array( $label, $columns, true ) ) {
					$columns[] = $label;
				}
				$values[ $label ] = (string) ( $answer['value'] ?? '' );
			}
			$entries[] = array( (string) get_post_field( 'post_date', (int) $id ), (string) get_post_meta( (int) $id, '_auvyx_form', true ), (string) get_post_meta( (int) $id, '_auvyx_page', true ), $values );
		}
		$rows = array( array_merge( array( 'Date', 'Form', 'Page' ), $columns ) );
		foreach ( $entries as $entry ) {
			$row = array( $entry[0], $entry[1], $entry[2] );
			foreach ( $columns as $label ) {
				$row[] = $entry[3][ $label ] ?? '';
			}
			// A spreadsheet runs a cell that starts with = + - @ as a formula: those start with a quote instead.
			$rows[] = array_map(
				static function ( string $cell ): string {
					return preg_match( '/^[=+\-@\t\r]/', $cell ) ? "'" . $cell : $cell;
				},
				$row
			);
		}
		return $rows;
	}

	public function export(): void {
		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_die( esc_html__( 'You cannot export form entries.', 'auvyx-builder' ), 403 );
		}
		check_admin_referer( self::EXPORT );
		$ids = get_posts(
			array(
				'post_type'      => self::ENTRY,
				'post_status'    => 'private',
				'posts_per_page' => 5000, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- one export, ids only.
				'fields'         => 'ids',
				'orderby'        => 'date',
				'order'          => 'DESC',
			)
		);
		nocache_headers();
		header( 'Content-Type: text/csv; charset=UTF-8' );
		header( 'Content-Disposition: attachment; filename="form-entries-' . gmdate( 'Y-m-d' ) . '.csv"' );
		$out = fopen( 'php://output', 'w' );
		fwrite( $out, "\xEF\xBB\xBF" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- the BOM Excel needs for UTF-8.
		foreach ( self::rows( array_map( 'intval', $ids ) ) as $row ) {
			fputcsv( $out, $row, ',', '"', '\\' );
		}
		fclose( $out ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		exit;
	}

	public function column( string $column, int $post_id ): void {
		if ( 'auvyx_form' === $column ) {
			echo esc_html( (string) get_post_meta( $post_id, '_auvyx_form', true ) );
		} elseif ( 'auvyx_summary' === $column ) {
			$parts = array();
			foreach ( array_slice( self::answers( $post_id ), 0, 3 ) as $answer ) {
				$parts[] = ( $answer['label'] ?? '' ) . ': ' . mb_substr( (string) ( $answer['value'] ?? '' ), 0, 60 );
			}
			echo esc_html( implode( ' · ', $parts ) );
		}
	}
}
